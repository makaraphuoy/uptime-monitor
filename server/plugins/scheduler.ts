import { db, sqlite } from '../db/index'
import { monitors, heartbeats } from '../db/schema'
import { eq } from 'drizzle-orm'
import { performCheck } from '../utils/checker'
import { readSettings } from '../utils/settings'
import { sendNotification } from '../utils/notify'
import { readAgents, checkViaAgents, majorityStatus } from '../utils/agents'
import { parseRegions } from '../utils/regions'

const HEARTBEAT_LIMIT = parseInt(process.env.HEARTBEAT_LIMIT || '10000', 10)
const TICK_MS = parseInt(process.env.TICK_MS || '5000', 10)
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50', 10)
// Minimum monitor interval (seconds) required to use regional agents.
// Prevents agent overhead for fast-polling monitors.
const MIN_AGENT_INTERVAL = parseInt(process.env.MIN_AGENT_INTERVAL || '60', 10)

// Prepared statements (created once, reused on every tick/check)
const pruneStmt = sqlite.prepare(`
  DELETE FROM heartbeats
  WHERE monitor_id = ?
    AND id NOT IN (
      SELECT id FROM heartbeats
      WHERE monitor_id = ?
      ORDER BY checked_at DESC
      LIMIT ?
    )
`)

// Atomically claim due monitors: advance next_check_at BEFORE execution so a
// restart can never re-run the same check cycle.
const claimStmt = sqlite.prepare(`
  UPDATE monitors
  SET
    next_check_at   = ? + (interval_seconds * 1000),
    last_checked_at = ?
  WHERE id IN (
    SELECT id FROM monitors
    WHERE enabled = 1
      AND next_check_at IS NOT NULL
      AND next_check_at <= ?
    LIMIT ?
  )
  RETURNING
    id, name, url, type, interval_seconds, timeout_seconds,
    enabled, regions, last_status, last_checked_at
`)

// Fetch the checked_at of the most recent local heartbeat (for durationMs)
const prevCheckedStmt = sqlite.prepare(
  `SELECT checked_at FROM heartbeats
   WHERE monitor_id = ? AND region = 'local'
   ORDER BY checked_at DESC LIMIT 1`
)

const monitorExistsStmt = sqlite.prepare('SELECT 1 FROM monitors WHERE id = ?').pluck()

interface ClaimedMonitor {
  id: number
  name: string
  url: string
  type: 'http' | 'tcp'
  interval_seconds: number
  timeout_seconds: number
  enabled: number
  regions: string | null
  last_status: string | null
  last_checked_at: number | null
}

async function runCheck(m: ClaimedMonitor) {
  try {
    // Bail silently if the monitor was deleted between the atomic claim and now
    if (!monitorExistsStmt.get(m.id)) return

    const now = Date.now()

    // Use the previous heartbeat's timestamp for durationMs (RETURNING gives post-update values)
    const prevHb = prevCheckedStmt.get(m.id) as { checked_at: number } | undefined
    const durationMs = prevHb?.checked_at
      ? Math.min(now - prevHb.checked_at, m.interval_seconds * 2 * 1000)
      : null

    const regions = parseRegions(m.regions)
    const hasRegions = regions.length > 0
    const matchedAgents = readAgents().filter(a => regions.includes(a.region))
    const useAgents = matchedAgents.length > 0 && m.interval_seconds >= MIN_AGENT_INTERVAL

    let overallStatus: 'up' | 'down'
    let overallMessage: string
    let overallResponseTimeMs: number
    let gotRegionalResults = false

    if (useAgents) {
      const regionResults = await checkViaAgents(
        m.type,
        m.url,
        m.timeout_seconds,
        regions
      )

      if (regionResults.length === 0) {
        const result = await performCheck(m.type, m.url, m.timeout_seconds)
        overallStatus = result.status
        overallMessage = result.message
        overallResponseTimeMs = result.responseTimeMs
      } else {
        gotRegionalResults = true
        for (const r of regionResults) {
          db.insert(heartbeats).values({
            monitorId: m.id, status: r.status,
            responseTimeMs: r.responseTimeMs, durationMs,
            checkedAt: new Date(now), message: r.message, region: r.region,
          }).run()
        }
        overallStatus = majorityStatus(regionResults)
        overallResponseTimeMs = Math.round(
          regionResults.reduce((s, r) => s + r.responseTimeMs, 0) / regionResults.length
        )
        overallMessage = regionResults.map(r => `${r.region}:${r.status}`).join(' ')
      }
    } else {
      const result = await performCheck(m.type, m.url, m.timeout_seconds)
      overallStatus = result.status
      overallMessage = result.message
      overallResponseTimeMs = result.responseTimeMs
    }

    db.insert(heartbeats).values({
      monitorId: m.id, status: overallStatus,
      responseTimeMs: overallResponseTimeMs, durationMs,
      checkedAt: new Date(now), message: overallMessage, region: 'local',
    }).run()

    pruneStmt.run(m.id, m.id, HEARTBEAT_LIMIT)

    // Persist last_status; prevStatus was captured before the claim updated the row
    const prevStatus = m.last_status
    sqlite.prepare('UPDATE monitors SET last_status = ? WHERE id = ?').run(overallStatus, m.id)

    const isAlertableChange =
      prevStatus !== null &&
      prevStatus !== overallStatus &&
      (overallStatus === 'down' || overallStatus === 'up') &&
      (!hasRegions || gotRegionalResults)

    if (isAlertableChange) {
      const settings = readSettings()
      const hasNotify = settings.webhookType === 'telegram'
        ? (settings.telegramBotToken && settings.telegramChatId)
        : settings.webhookUrl
      if (hasNotify) {
        sendNotification(
          settings,
          { name: m.name, url: m.url },
          overallStatus,
          overallMessage
        ).catch(() => {})
      }
    }
  } catch (err: any) {
    // Monitor was deleted mid-check (between claim and heartbeat insert) — not an error
    if (err?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return
    console.error(`[Scheduler] Error checking monitor ${m.id}:`, err)
  }
}

function tick() {
  const now = Date.now()
  const due = claimStmt.all(now, now, now, BATCH_SIZE) as ClaimedMonitor[]
  for (const monitor of due) {
    runCheck(monitor).catch(err =>
      console.error(`[Scheduler] Unhandled rejection for monitor ${monitor.id}:`, err)
    )
  }
}

// Called by API routes after create/update/toggle
export function scheduleMonitor(monitorId: number, _intervalSeconds: number, enabled: boolean) {
  if (enabled) {
    // Trigger immediate check on next tick
    sqlite.prepare('UPDATE monitors SET next_check_at = ? WHERE id = ?').run(Date.now(), monitorId)
  }
  // Disabled monitors are skipped by the tick loop (WHERE enabled = 1)
}

// Called by the delete route — no-op since deletion cascades via FK
export function unscheduleMonitor(_monitorId: number) {}

export default defineNitroPlugin(() => {
  console.log('[Scheduler] Initializing...')

  try {
    // Seed next_check_at for enabled monitors that haven't been scheduled yet
    const seeded = sqlite.prepare(`
      UPDATE monitors
      SET next_check_at = ?
      WHERE enabled = 1 AND (next_check_at IS NULL OR next_check_at = 0)
    `).run(Date.now())

    if ((seeded as any).changes > 0) {
      console.log(`[Scheduler] Seeded next_check_at for ${(seeded as any).changes} monitor(s)`)
    }

    // Backfill last_status from the latest local heartbeat for monitors that have history
    sqlite.exec(`
      UPDATE monitors SET last_status = (
        SELECT status FROM heartbeats
        WHERE monitor_id = monitors.id AND region = 'local'
        ORDER BY checked_at DESC
        LIMIT 1
      )
      WHERE last_status IS NULL
    `)

    const count = (
      sqlite.prepare('SELECT COUNT(*) as n FROM monitors WHERE enabled = 1').get() as { n: number }
    ).n
    console.log(`[Scheduler] ${count} enabled monitor(s) in queue`)
    console.log(`[Scheduler] Heartbeat limit per monitor: ${HEARTBEAT_LIMIT}`)
  } catch (err) {
    console.error('[Scheduler] Init failed:', err)
  }

  setInterval(tick, TICK_MS)
  console.log(`[Scheduler] Global tick running every ${TICK_MS / 1000}s`)

  // Purge expired sessions hourly
  setInterval(() => {
    try {
      const result = sqlite.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Math.floor(Date.now() / 1000))
      if (result.changes > 0) {
        console.log(`[Scheduler] Pruned ${result.changes} expired session(s)`)
      }
    } catch (err) {
      console.error('[Scheduler] Session cleanup failed:', err)
    }
  }, 60 * 60 * 1000)

  // WAL checkpoint hourly — prevents unbounded WAL file growth
  setInterval(() => {
    try {
      sqlite.pragma('wal_checkpoint(TRUNCATE)')
      console.log('[DB] WAL checkpoint completed')
    } catch (err) {
      console.error('[DB] WAL checkpoint failed:', err)
    }
  }, 60 * 60 * 1000)
})
