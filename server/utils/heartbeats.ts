import { db, sqlite } from '../db/index'
import { heartbeats } from '../db/schema'
import { eq, desc, gte, and, sql, inArray } from 'drizzle-orm'

export interface UptimeStats {
  uptime24h: number | null
  uptime7d: number | null
  uptime30d: number | null
}

const pct = (up: number | null, total: number | null): number | null =>
  total ? Math.round(((up ?? 0) / total) * 1000) / 10 : null

// ─── Single-monitor ──────────────────────────────────────────────────────────

/**
 * Calculates uptime % for 24h, 7d, and 30d windows in a single SQL query
 * using conditional aggregation — avoids loading rows into JS memory.
 */
export function calcUptimeStats(monitorId: number): UptimeStats {
  const now     = Date.now()
  const ms30d   = now - 30 * 24 * 60 * 60 * 1000
  const ms7d    = now -  7 * 24 * 60 * 60 * 1000
  const ms24h   = now -      24 * 60 * 60 * 1000

  // gte() uses Drizzle's ORM path which converts Date → integer automatically.
  // sql<> templates bypass that, so pass raw integer milliseconds directly.
  const row = db.select({
    total30d: sql<number>`COUNT(*)`,
    up30d:    sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' THEN 1 ELSE 0 END)`,
    total7d:  sql<number>`SUM(CASE WHEN ${heartbeats.checkedAt} >= ${ms7d} THEN 1 ELSE 0 END)`,
    up7d:     sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' AND ${heartbeats.checkedAt} >= ${ms7d} THEN 1 ELSE 0 END)`,
    total24h: sql<number>`SUM(CASE WHEN ${heartbeats.checkedAt} >= ${ms24h} THEN 1 ELSE 0 END)`,
    up24h:    sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' AND ${heartbeats.checkedAt} >= ${ms24h} THEN 1 ELSE 0 END)`,
  })
    .from(heartbeats)
    .where(and(eq(heartbeats.monitorId, monitorId), gte(heartbeats.checkedAt, new Date(ms30d))))
    .get()

  return {
    uptime24h: pct(row?.up24h ?? null, row?.total24h ?? null),
    uptime7d:  pct(row?.up7d  ?? null, row?.total7d  ?? null),
    uptime30d: pct(row?.up30d ?? null, row?.total30d ?? null),
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
 * Calculates uptime stats for multiple monitors in a single SQL query (GROUP BY).
 * Reduces N uptime queries to 1 regardless of monitor count.
 */
export function calcUptimeStatsBatch(monitorIds: number[]): Record<number, UptimeStats> {
  if (monitorIds.length === 0) return {}

  const now   = Date.now()
  const ms30d = now - 30 * 24 * 60 * 60 * 1000
  const ms7d  = now -  7 * 24 * 60 * 60 * 1000
  const ms24h = now -      24 * 60 * 60 * 1000

  const rows = db.select({
    monitorId: heartbeats.monitorId,
    total30d:  sql<number>`COUNT(*)`,
    up30d:     sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' THEN 1 ELSE 0 END)`,
    total7d:   sql<number>`SUM(CASE WHEN ${heartbeats.checkedAt} >= ${ms7d} THEN 1 ELSE 0 END)`,
    up7d:      sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' AND ${heartbeats.checkedAt} >= ${ms7d} THEN 1 ELSE 0 END)`,
    total24h:  sql<number>`SUM(CASE WHEN ${heartbeats.checkedAt} >= ${ms24h} THEN 1 ELSE 0 END)`,
    up24h:     sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' AND ${heartbeats.checkedAt} >= ${ms24h} THEN 1 ELSE 0 END)`,
  })
    .from(heartbeats)
    .where(and(inArray(heartbeats.monitorId, monitorIds), gte(heartbeats.checkedAt, new Date(ms30d))))
    .groupBy(heartbeats.monitorId)
    .all()

  const result: Record<number, UptimeStats> = {}
  for (const row of rows) {
    result[row.monitorId] = {
      uptime24h: pct(row.up24h, row.total24h),
      uptime7d:  pct(row.up7d,  row.total7d),
      uptime30d: pct(row.up30d, row.total30d),
    }
  }
  return result
}

/**
 * Fetches the last N heartbeats for multiple monitors in a single SQL query
 * using a window function (ROW_NUMBER PARTITION BY monitor_id).
 * Reduces N recent-heartbeat queries to 1 regardless of monitor count.
 */
export function getRecentHeartbeatsBatch(monitorIds: number[], limit = 10) {
  if (monitorIds.length === 0) return {} as Record<number, { latest: any; recent: any[] }>

  const placeholders = monitorIds.map(() => '?').join(', ')
  const rows = sqlite.prepare(`
    SELECT id,
           monitor_id  AS monitorId,
           status,
           response_time_ms AS responseTimeMs,
           checked_at  AS checkedAt,
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
    checkedAt: number | null
    message: string | null
  }>

  // Initialise empty buckets for every requested monitor
  const result: Record<number, { latest: any; recent: any[] }> = {}
  for (const id of monitorIds) result[id] = { latest: null, recent: [] }

  for (const row of rows) {
    // Convert integer timestamp → Date so serialisation matches Drizzle output
    const mapped = { ...row, checkedAt: row.checkedAt != null ? new Date(row.checkedAt) : null }
    result[row.monitorId].recent.push(mapped)
  }

  for (const id of monitorIds) {
    const g = result[id]
    g.latest = g.recent[g.recent.length - 1] ?? null
  }

  return result
}
