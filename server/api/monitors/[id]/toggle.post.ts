import { db } from '../../../db/index'
import { monitors } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { scheduleMonitor } from '../../../plugins/scheduler'

export default defineEventHandler(async (event) => {
  try {
    const id = parseInt(getRouterParam(event, 'id') || '0', 10)
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid monitor ID' })

    const existing = db.select().from(monitors).where(eq(monitors.id, id)).get()
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
    if (existing.userId !== event.context.user!.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

    const newEnabled = !existing.enabled

    const updated = db.update(monitors)
      .set({ enabled: newEnabled, updatedAt: new Date() })
      .where(eq(monitors.id, id))
      .returning()
      .get()

    scheduleMonitor(updated.id, updated.intervalSeconds, updated.enabled)

    return updated
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: err.message })
  }
})
