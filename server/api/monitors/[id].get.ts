import { db } from '../../db/index'
import { monitors, heartbeats } from '../../db/schema'
import { eq, desc } from 'drizzle-orm'
import { calcUptimeStats, getRecentHeartbeats } from '../../utils/heartbeats'
import { parseRegions } from '../../utils/regions'

export default defineEventHandler(async (event) => {
  try {
    const id = parseInt(getRouterParam(event, 'id') || '0', 10)
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid monitor ID' })

    const monitor = db.select().from(monitors).where(eq(monitors.id, id)).get()
    if (!monitor) throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
    if (monitor.userId !== event.context.user!.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

    const { latest, recent: recentHeartbeats } = getRecentHeartbeats(id, 90)
    const uptime = calcUptimeStats(id)

    // Get incidents (status changes) — bounded at 200, fine to do in JS
    const allHeartbeats = db.select()
      .from(heartbeats)
      .where(eq(heartbeats.monitorId, id))
      .orderBy(desc(heartbeats.checkedAt))
      .limit(200)
      .all()

    const incidents = []
    for (let i = 0; i < allHeartbeats.length - 1; i++) {
      const current = allHeartbeats[i]
      const next = allHeartbeats[i + 1]
      if (current.status !== next.status && (current.status === 'down' || next.status === 'down')) {
        incidents.push({
          id: current.id,
          from: next.status,
          to: current.status,
          at: current.checkedAt,
          message: current.message
        })
      }
    }

    return {
      ...monitor,
      regions: parseRegions(monitor.regions),
      latestHeartbeat: latest,
      ...uptime,
      recentHeartbeats,
      incidents: incidents.slice(0, 20)
    }
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: err.message })
  }
})
