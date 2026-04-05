import { db, sqlite } from '../db/index'
import { heartbeats } from '../db/schema'
import { eq, desc, gte, and, sql, inArray } from 'drizzle-orm'

export interface UptimeStats {
  uptime24h: number | null
  uptime7d: number | null
  uptime30d: number | null
}

const pct = (upMs: number | null, totalMs: number | null): number | null =>
  totalMs ? Math.round(((upMs ?? 0) / totalMs) * 1000) / 10 : null

// ─── Single-monitor ──────────────────────────────────────────────────────────

/**
 * Time-weighted uptime: SUM(duration_ms where up) / SUM(duration_ms).
 * Rows without duration_ms (first heartbeat per monitor) are excluded from
 * both numerator and denominator — they don't skew the result.
 */
export function calcUptimeStats(monitorId: number): UptimeStats {
  const now   = Date.now()
  const ms30d = now - 30 * 24 * 60 * 60 * 1000
  const ms7d  = now -  7 * 24 * 60 * 60 * 1000
  const ms24h = now -      24 * 60 * 60 * 1000
  // checked_at is stored as Unix seconds (mode: 'timestamp'), so convert thresholds
  const s7d  = Math.floor(ms7d  / 1000)
  const s24h = Math.floor(ms24h / 1000)

  const row = db.select({
    totalMs30d: sql<number>`SUM(${heartbeats.durationMs})`,
    upMs30d:    sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' THEN ${heartbeats.durationMs} END)`,
    totalMs7d:  sql<number>`SUM(CASE WHEN ${heartbeats.checkedAt} >= ${s7d} THEN ${heartbeats.durationMs} END)`,
    upMs7d:     sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' AND ${heartbeats.checkedAt} >= ${s7d} THEN ${heartbeats.durationMs} END)`,
    totalMs24h: sql<number>`SUM(CASE WHEN ${heartbeats.checkedAt} >= ${s24h} THEN ${heartbeats.durationMs} END)`,
    upMs24h:    sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' AND ${heartbeats.checkedAt} >= ${s24h} THEN ${heartbeats.durationMs} END)`,
  })
    .from(heartbeats)
    .where(and(eq(heartbeats.monitorId, monitorId), gte(heartbeats.checkedAt, new Date(ms30d))))
    .get()

  return {
    uptime24h: pct(row?.upMs24h ?? null, row?.totalMs24h ?? null),
    uptime7d:  pct(row?.upMs7d  ?? null, row?.totalMs7d  ?? null),
    uptime30d: pct(row?.upMs30d ?? null, row?.totalMs30d ?? null),
  }
}

/**
 * Fetches the N most recent heartbeats (oldest-first for chart rendering).
 * Returns latest separately so callers don't need a second query.
 */
export function getRecentHeartbeats(monitorId: number, limit = 10) {
  const rows = db.select()
    .from(heartbeats)
    .where(eq(heartbeats.monitorId, monitorId))
    .orderBy(desc(heartbeats.checkedAt))
    .limit(limit)
    .all()

  return {
    latest: rows[0] ?? null,
    recent: rows.slice().reverse(),
  }
}

// ─── Batch (N+1 fix) ─────────────────────────────────────────────────────────

/**
 * Time-weighted uptime for multiple monitors in one SQL query (GROUP BY).
 */
export function calcUptimeStatsBatch(monitorIds: number[]): Record<number, UptimeStats> {
  if (monitorIds.length === 0) return {}

  const now   = Date.now()
  const ms30d = now - 30 * 24 * 60 * 60 * 1000
  const ms7d  = now -  7 * 24 * 60 * 60 * 1000
  const ms24h = now -      24 * 60 * 60 * 1000
  // checked_at is stored as Unix seconds (mode: 'timestamp'), so convert thresholds
  const s7d  = Math.floor(ms7d  / 1000)
  const s24h = Math.floor(ms24h / 1000)

  const rows = db.select({
    monitorId:  heartbeats.monitorId,
    totalMs30d: sql<number>`SUM(${heartbeats.durationMs})`,
    upMs30d:    sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' THEN ${heartbeats.durationMs} END)`,
    totalMs7d:  sql<number>`SUM(CASE WHEN ${heartbeats.checkedAt} >= ${s7d} THEN ${heartbeats.durationMs} END)`,
    upMs7d:     sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' AND ${heartbeats.checkedAt} >= ${s7d} THEN ${heartbeats.durationMs} END)`,
    totalMs24h: sql<number>`SUM(CASE WHEN ${heartbeats.checkedAt} >= ${s24h} THEN ${heartbeats.durationMs} END)`,
    upMs24h:    sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' AND ${heartbeats.checkedAt} >= ${s24h} THEN ${heartbeats.durationMs} END)`,
  })
    .from(heartbeats)
    .where(and(inArray(heartbeats.monitorId, monitorIds), gte(heartbeats.checkedAt, new Date(ms30d))))
    .groupBy(heartbeats.monitorId)
    .all()

  const result: Record<number, UptimeStats> = {}
  for (const row of rows) {
    result[row.monitorId] = {
      uptime24h: pct(row.upMs24h, row.totalMs24h),
      uptime7d:  pct(row.upMs7d,  row.totalMs7d),
      uptime30d: pct(row.upMs30d, row.totalMs30d),
    }
  }
  return result
}

/**
 * Fetches the last N heartbeats for multiple monitors in a single SQL query
 * using a window function (ROW_NUMBER PARTITION BY monitor_id).
 */
export function getRecentHeartbeatsBatch(monitorIds: number[], limit = 10) {
  if (monitorIds.length === 0) return {} as Record<number, { latest: any; recent: any[] }>

  const placeholders = monitorIds.map(() => '?').join(', ')
  const rows = sqlite.prepare(`
    SELECT id,
           monitor_id       AS monitorId,
           status,
           response_time_ms AS responseTimeMs,
           duration_ms      AS durationMs,
           checked_at       AS checkedAt,
           message
    FROM (
      SELECT *,
             ROW_NUMBER() OVER (PARTITION BY monitor_id ORDER BY checked_at DESC) AS rn
      FROM heartbeats
      WHERE monitor_id IN (${placeholders})
    )
    WHERE rn <= ?
    ORDER BY monitorId, checkedAt ASC
  `).all(...monitorIds, limit) as Array<{
    id: number
    monitorId: number
    status: 'up' | 'down' | 'pending'
    responseTimeMs: number | null
    durationMs: number | null
    checkedAt: number | null
    message: string | null
  }>

  const result: Record<number, { latest: any; recent: any[] }> = {}
  for (const id of monitorIds) result[id] = { latest: null, recent: [] }

  for (const row of rows) {
    const mapped = { ...row, checkedAt: row.checkedAt != null ? new Date(row.checkedAt) : null }
    result[row.monitorId].recent.push(mapped)
  }

  for (const id of monitorIds) {
    const g = result[id]
    g.latest = g.recent[g.recent.length - 1] ?? null
  }

  return result
}
