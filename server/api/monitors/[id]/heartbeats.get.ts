import { db } from '../../../db/index'
import { monitors, heartbeats } from '../../../db/schema'
import { eq, desc, gte, and, sql, count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  try {
    const id = parseInt(getRouterParam(event, 'id') || '0', 10)
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid monitor ID' })

    const monitor = db.select().from(monitors).where(eq(monitors.id, id)).get()
    if (!monitor) throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
    if (monitor.userId !== event.context.user!.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

    const query = getQuery(event)
    const period   = (query.period   as string) || '24h'
    const chartLimit = Math.min(500, parseInt((query.chartLimit as string) || '200', 10))
    const page     = Math.max(1,   parseInt((query.page     as string) || '1',  10))
    const pageSize = Math.min(100, Math.max(1, parseInt((query.pageSize as string) || '20', 10)))

    const now = new Date()
    let since: Date
    switch (period) {
      case '7d':  since = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000); break
      case '30d': since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break
      default:    since = new Date(now.getTime() -      24 * 60 * 60 * 1000); break
    }

    const whereClause = and(eq(heartbeats.monitorId, id), gte(heartbeats.checkedAt, since))

    // Chart data — sampled/limited, oldest-first for rendering
    const chartRows = db.select()
      .from(heartbeats)
      .where(whereClause)
      .orderBy(desc(heartbeats.checkedAt))
      .limit(chartLimit)
      .all()
      .reverse()

    // Time-weighted stats over the full period
    const statsRow = db.select({
      upCount:         sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' THEN 1 ELSE 0 END)`,
      downCount:       sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'down' THEN 1 ELSE 0 END)`,
      totalMs:         sql<number>`SUM(${heartbeats.durationMs})`,
      upMs:            sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' THEN ${heartbeats.durationMs} END)`,
      avgResponseTime: sql<number>`CAST(ROUND(AVG(${heartbeats.responseTimeMs})) AS INTEGER)`,
      minResponseTime: sql<number>`MIN(${heartbeats.responseTimeMs})`,
      maxResponseTime: sql<number>`MAX(${heartbeats.responseTimeMs})`,
    })
      .from(heartbeats)
      .where(whereClause)
      .get()

    const totalMs = statsRow?.totalMs ?? 0
    const uptimePercent = totalMs > 0
      ? Math.round(((statsRow?.upMs ?? 0) / totalMs) * 1000) / 10
      : null

    // Paginated recent checks — newest first
    const totalChecks = (db.select({ n: count() }).from(heartbeats).where(whereClause).get()?.n) ?? 0
    const recentRows = db.select()
      .from(heartbeats)
      .where(whereClause)
      .orderBy(desc(heartbeats.checkedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all()

    return {
      heartbeats: chartRows,
      stats: {
        upCount:         statsRow?.upCount         ?? 0,
        downCount:       statsRow?.downCount        ?? 0,
        uptimePercent,
        avgResponseTime: statsRow?.avgResponseTime  ?? null,
        minResponseTime: statsRow?.minResponseTime  ?? null,
        maxResponseTime: statsRow?.maxResponseTime  ?? null,
        period,
      },
      recentChecks: {
        data:       recentRows,
        total:      totalChecks,
        page,
        pageSize,
        totalPages: Math.ceil(totalChecks / pageSize),
      },
    }
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: err.message })
  }
})
