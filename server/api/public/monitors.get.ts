import { db } from '../../db/index'
import { monitors } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { calcUptimeStatsBatch, getRecentHeartbeatsBatch } from '../../utils/heartbeats'

export default defineEventHandler((event) => {
  try {
    const query = getQuery(event)
    const heartbeatLimit = Math.min(parseInt((query.heartbeatLimit as string) || '90', 10), 100)

    const publicMonitors = db.select()
      .from(monitors)
      .where(eq(monitors.visibility, 'public'))
      .orderBy(monitors.createdAt)
      .all()

    if (publicMonitors.length === 0) {
      // Cache empty response longer — nothing to update
      setHeader(event, 'Cache-Control', 'public, max-age=60')
      return []
    }

    const monitorIds = publicMonitors.map(m => m.id)

    // 2 queries total for ALL monitors
    const uptimeMap    = calcUptimeStatsBatch(monitorIds)
    const heartbeatMap = getRecentHeartbeatsBatch(monitorIds, heartbeatLimit)

    // Cache for 30 s; stale-while-revalidate lets browsers use cached data
    // while fetching fresh data in the background
    setHeader(event, 'Cache-Control', 'public, max-age=30, stale-while-revalidate=60')

    return publicMonitors.map(monitor => ({
      id:      monitor.id,
      name:    monitor.name,
      url:     monitor.url,
      type:    monitor.type,
      enabled: monitor.enabled,
      latestHeartbeat:  heartbeatMap[monitor.id]?.latest  ?? null,
      ...(uptimeMap[monitor.id] ?? { uptime24h: null, uptime7d: null, uptime30d: null }),
      recentHeartbeats: heartbeatMap[monitor.id]?.recent  ?? [],
    }))
  } catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: err.message })
  }
})
