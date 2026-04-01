import { db } from '../../db/index'
import { monitors, heartbeats } from '../../db/schema'
import { eq, desc, gte, and } from 'drizzle-orm'

export default defineEventHandler(async () => {
  try {
    const publicMonitors = db.select()
      .from(monitors)
      .where(eq(monitors.visibility, 'public'))
      .orderBy(monitors.createdAt)
      .all()

    const result = await Promise.all(publicMonitors.map(async (monitor) => {
      const latestHeartbeat = db.select()
        .from(heartbeats)
        .where(eq(heartbeats.monitorId, monitor.id))
        .orderBy(desc(heartbeats.checkedAt))
        .limit(1)
        .all()[0] || null

      const now = new Date()
      const day24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const day7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const calcUptime = (since: Date) => {
        const hbs = db.select()
          .from(heartbeats)
          .where(and(eq(heartbeats.monitorId, monitor.id), gte(heartbeats.checkedAt, since)))
          .all()
        if (hbs.length === 0) return null
        return Math.round((hbs.filter(h => h.status === 'up').length / hbs.length) * 1000) / 10
      }

      const recentHeartbeats = db.select()
        .from(heartbeats)
        .where(eq(heartbeats.monitorId, monitor.id))
        .orderBy(desc(heartbeats.checkedAt))
        .limit(90)
        .all()
        .reverse()

      // Return only fields needed by the public status page (no userId)
      return {
        id: monitor.id,
        name: monitor.name,
        url: monitor.url,
        type: monitor.type,
        enabled: monitor.enabled,
        latestHeartbeat,
        uptime24h: calcUptime(day24),
        uptime7d: calcUptime(day7),
        uptime30d: calcUptime(day30),
        recentHeartbeats,
      }
    }))

    return result
  } catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: err.message })
  }
})
