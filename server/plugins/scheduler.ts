import { db, sqlite } from '../db/index'
import { monitors, heartbeats, sessions } from '../db/schema'
import { eq } from 'drizzle-orm'
import { performCheck } from '../utils/checker'
import { readSettings } from '../utils/settings'
import { sendNotification } from '../utils/notify'

// Maximum heartbeats retained per monitor. Override via HEARTBEAT_LIMIT env var.
const HEARTBEAT_LIMIT = parseInt(process.env.HEARTBEAT_LIMIT || '10000', 10)

// Track timers per monitor
const monitorTimers = new Map<number, ReturnType<typeof setInterval>>()

// Track last known status to detect changes
const previousStatus = new Map<number, string>()

// Track last check time per monitor for duration_ms calculation
const lastCheckedAt = new Map<number, number>()

// Prepared statement for pruning (created once, reused on every check)
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

async function checkMonitor(monitorId: number) {
  try {
    const monitor = db.select().from(monitors).where(eq(monitors.id, monitorId)).get()

    if (!monitor || !monitor.enabled) {
      stopMonitor(monitorId)
      return
    }

    const result = await performCheck(
      monitor.type as 'http' | 'tcp',
      monitor.url,
      monitor.timeoutSeconds
    )

    const now = Date.now()
    const prev = lastCheckedAt.get(monitorId)
    const durationMs = prev ? Math.min(now - prev, monitor.intervalSeconds * 2 * 1000) : null
    lastCheckedAt.set(monitorId, now)

    db.insert(heartbeats).values({
      monitorId: monitor.id,
      status: result.status,
      responseTimeMs: result.responseTimeMs,
      durationMs,
      checkedAt: new Date(now),
      message: result.message
    }).run()

    // Prune to HEARTBEAT_LIMIT in a single SQL statement
    pruneStmt.run(monitorId, monitorId, HEARTBEAT_LIMIT)

    // Detect status change and fire notification
    const newStatus  = result.status
    const prevStatus = previousStatus.get(monitorId)
    previousStatus.set(monitorId, newStatus)

    const isAlertableChange =
      prevStatus !== undefined &&
      prevStatus !== newStatus &&
      (newStatus === 'down' || newStatus === 'up')

    if (isAlertableChange) {
      const settings = readSettings()
      const hasNotify = settings.webhookType === 'telegram'
        ? (settings.telegramBotToken && settings.telegramChatId)
        : settings.webhookUrl
      if (hasNotify) {
        sendNotification(
          settings,
          { name: monitor.name, url: monitor.url },
          newStatus as 'down' | 'up',
          result.message
        ).catch(() => {})
      }
    }
  } catch (err) {
    console.error(`[Scheduler] Error checking monitor ${monitorId}:`, err)
  }
}

function startMonitor(monitorId: number, intervalSeconds: number) {
  stopMonitor(monitorId)
  checkMonitor(monitorId)
  const timer = setInterval(() => checkMonitor(monitorId), intervalSeconds * 1000)
  monitorTimers.set(monitorId, timer)
}

function stopMonitor(monitorId: number) {
  const timer = monitorTimers.get(monitorId)
  if (timer) {
    clearInterval(timer)
    monitorTimers.delete(monitorId)
    lastCheckedAt.delete(monitorId)
  }
}

export function scheduleMonitor(monitorId: number, intervalSeconds: number, enabled: boolean) {
  if (enabled) {
    startMonitor(monitorId, intervalSeconds)
  } else {
    stopMonitor(monitorId)
  }
}

export function unscheduleMonitor(monitorId: number) {
  stopMonitor(monitorId)
}

export default defineNitroPlugin(async () => {
  console.log('[Scheduler] Starting monitoring scheduler...')

  try {
    const allMonitors = db.select().from(monitors).all()
    let started = 0

    for (let i = 0; i < allMonitors.length; i++) {
      const monitor = allMonitors[i]
      if (!monitor.enabled) continue

      // Seed previousStatus from the latest heartbeat so we don't false-trigger on boot
      const latest = db.select().from(heartbeats)
        .where(eq(heartbeats.monitorId, monitor.id))
        .all()
        .sort((a, b) => (b.checkedAt?.getTime() ?? 0) - (a.checkedAt?.getTime() ?? 0))[0]

      if (latest) {
        previousStatus.set(monitor.id, latest.status)
        if (latest.checkedAt) lastCheckedAt.set(monitor.id, latest.checkedAt.getTime())
      }

      // Stagger startup by 500 ms per monitor to avoid a thundering herd on boot
      if (i === 0) {
        startMonitor(monitor.id, monitor.intervalSeconds)
      } else {
        setTimeout(() => startMonitor(monitor.id, monitor.intervalSeconds), i * 500)
      }
      started++
    }

    console.log(`[Scheduler] Started ${started} monitor(s) out of ${allMonitors.length} total (staggered)`)
    console.log(`[Scheduler] Heartbeat limit per monitor: ${HEARTBEAT_LIMIT}`)
  } catch (err) {
    console.error('[Scheduler] Failed to initialize scheduler:', err)
  }

  // ─── Hourly maintenance tasks ─────────────────────────────────────────────

  // Purge expired sessions
  setInterval(() => {
    try {
      const result = sqlite.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
      if (result.changes > 0) {
        console.log(`[Scheduler] Pruned ${result.changes} expired session(s)`)
      }
    } catch (err) {
      console.error('[Scheduler] Session cleanup failed:', err)
    }
  }, 60 * 60 * 1000)

  // WAL checkpoint — prevents unbounded WAL file growth
  setInterval(() => {
    try {
      sqlite.pragma('wal_checkpoint(TRUNCATE)')
      console.log('[DB] WAL checkpoint completed')
    } catch (err) {
      console.error('[DB] WAL checkpoint failed:', err)
    }
  }, 60 * 60 * 1000)
})
