import { db } from '../../db/index'
import { monitors } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { calcUptimeStatsBatch, getRecentHeartbeatsBatch } from '../../utils/heartbeats'

export default defineEventHandler((event) => {
  try {
    const userId = event.context.user!.id
    const query = getQuery(event)
    const heartbeatLimit = Math.min(parseInt((query.heartbeatLimit as string) || '10', 10), 100)

    const allMonitors = db.select()
      .from(monitors)
      .where(eq(monitors.userId, userId))
      .orderBy(monitors.createdAt)
      .all()

    if (allMonitors.length === 0) return []

    const monitorIds = allMonitors.map(m => m.id)

    // 2 queries total for ALL monitors (regardless of count)
    const uptimeMap    = calcUptimeStatsBatch(monitorIds)
    const heartbeatMap = getRecentHeartbeatsBatch(monitorIds, heartbeatLimit)

    return allMonitors.map(monitor => ({
      ...monitor,
      latestHeartbeat:  heartbeatMap[monitor.id]?.latest  ?? null,
      ...(uptimeMap[monitor.id] ?? { uptime24h: null, uptime7d: null, uptime30d: null }),
      recentHeartbeats: heartbeatMap[monitor.id]?.recent  ?? [],
    }))
  } catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: err.message })
  }
})
