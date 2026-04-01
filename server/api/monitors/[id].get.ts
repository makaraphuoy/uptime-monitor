import { db } from '../../db/index'
import { monitors, heartbeats } from '../../db/schema'
import { eq, desc, gte, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  try {
    const id = parseInt(getRouterParam(event, 'id') || '0', 10)
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid monitor ID' })

    const monitor = db.select().from(monitors).where(eq(monitors.id, id)).get()
    if (!monitor) throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
    if (monitor.userId !== event.context.user!.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

    const now = new Date()
    const day24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const day7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const calcUptime = (since: Date) => {
      const hbs = db.select()
        .from(heartbeats)
        .where(and(eq(heartbeats.monitorId, id), gte(heartbeats.checkedAt, since)))
        .all()
      if (hbs.length === 0) return null
      const upCount = hbs.filter(h => h.status === 'up').length
      return Math.round((upCount / hbs.length) * 1000) / 10
    }

    // Get latest heartbeat
    const latestHeartbeat = db.select()
      .from(heartbeats)
      .where(eq(heartbeats.monitorId, id))
      .orderBy(desc(heartbeats.checkedAt))
      .limit(1)
      .all()[0] || null

    // Get last 90 heartbeats for status bar
    const recentHeartbeats = db.select()
      .from(heartbeats)
      .where(eq(heartbeats.monitorId, id))
      .orderBy(desc(heartbeats.checkedAt))
      .limit(90)
      .all()
      .reverse()

    // Get incidents (status changes)
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
      latestHeartbeat,
      uptime24h: calcUptime(day24),
      uptime7d: calcUptime(day7),
      uptime30d: calcUptime(day30),
      recentHeartbeats,
      incidents: incidents.slice(0, 20)
    }
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: err.message })
  }
})
