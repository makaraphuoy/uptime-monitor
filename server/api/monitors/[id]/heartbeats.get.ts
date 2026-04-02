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
    const period = (query.period as string) || '24h'
    const limit  = parseInt((query.limit  as string) || '200', 10)

    const now = new Date()
    let since: Date
    switch (period) {
      case '7d':  since = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000); break
      case '30d': since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break
      default:    since = new Date(now.getTime() -      24 * 60 * 60 * 1000); break
    }

    const whereClause = and(eq(heartbeats.monitorId, id), gte(heartbeats.checkedAt, since))

    // Rows for chart — bounded by limit
    const hbs = db.select()
      .from(heartbeats)
      .where(whereClause)
      .orderBy(desc(heartbeats.checkedAt))
      .limit(limit)
      .all()
      .reverse()

    // Stats via SQL aggregates — covers full period (not limited to chart rows)
    const statsRow = db.select({
      total:           count(),
      upCount:         sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'up' THEN 1 ELSE 0 END)`,
      downCount:       sql<number>`SUM(CASE WHEN ${heartbeats.status} = 'down' THEN 1 ELSE 0 END)`,
      avgResponseTime: sql<number>`CAST(ROUND(AVG(${heartbeats.responseTimeMs})) AS INTEGER)`,
      minResponseTime: sql<number>`MIN(${heartbeats.responseTimeMs})`,
      maxResponseTime: sql<number>`MAX(${heartbeats.responseTimeMs})`,
    })
      .from(heartbeats)
      .where(whereClause)
      .get()

    const total = statsRow?.total ?? 0

    return {
      heartbeats: hbs,
      stats: {
        total,
        upCount:         statsRow?.upCount         ?? 0,
        downCount:       statsRow?.downCount        ?? 0,
        uptimePercent:   total > 0 ? Math.round(((statsRow?.upCount ?? 0) / total) * 1000) / 10 : null,
        avgResponseTime: statsRow?.avgResponseTime  ?? null,
        minResponseTime: statsRow?.minResponseTime  ?? null,
        maxResponseTime: statsRow?.maxResponseTime  ?? null,
        period,
      },
    }
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: err.message })
  }
})
