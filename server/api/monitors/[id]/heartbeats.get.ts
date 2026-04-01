import { db } from '../../../db/index'
import { monitors, heartbeats } from '../../../db/schema'
import { eq, desc, gte, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  try {
    const id = parseInt(getRouterParam(event, 'id') || '0', 10)
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid monitor ID' })

    const monitor = db.select().from(monitors).where(eq(monitors.id, id)).get()
    if (!monitor) throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
    if (monitor.userId !== event.context.user!.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

    const query = getQuery(event)
    const period = (query.period as string) || '24h'
    const limit = parseInt((query.limit as string) || '200', 10)

    let since: Date
    const now = new Date()
    switch (period) {
      case '7d':
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '24h':
      default:
        since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
    }

    const hbs = db.select()
      .from(heartbeats)
      .where(
        and(
          eq(heartbeats.monitorId, id),
          gte(heartbeats.checkedAt, since)
        )
      )
      .orderBy(desc(heartbeats.checkedAt))
      .limit(limit)
      .all()
      .reverse()

    // Calculate stats
    const upCount = hbs.filter(h => h.status === 'up').length
    const downCount = hbs.filter(h => h.status === 'down').length
    const uptimePercent = hbs.length > 0
      ? Math.round((upCount / hbs.length) * 1000) / 10
      : null

    const responseTimes = hbs
      .filter(h => h.responseTimeMs !== null && h.responseTimeMs !== undefined)
      .map(h => h.responseTimeMs as number)

    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null

    const minResponseTime = responseTimes.length > 0
      ? Math.min(...responseTimes)
      : null

    const maxResponseTime = responseTimes.length > 0
      ? Math.max(...responseTimes)
      : null

    return {
      heartbeats: hbs,
      stats: {
        total: hbs.length,
        upCount,
        downCount,
        uptimePercent,
        avgResponseTime,
        minResponseTime,
        maxResponseTime,
        period
      }
    }
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: err.message })
  }
})
