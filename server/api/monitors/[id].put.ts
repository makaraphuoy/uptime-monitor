import { db } from '../../db/index'
import { monitors } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { scheduleMonitor } from '../../plugins/scheduler'

export default defineEventHandler(async (event) => {
  try {
    const id = parseInt(getRouterParam(event, 'id') || '0', 10)
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid monitor ID' })

    const existing = db.select().from(monitors).where(eq(monitors.id, id)).get()
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
    if (existing.userId !== event.context.user!.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

    const body = await readBody(event)

    const updateData: any = {
      updatedAt: new Date()
    }

    if (body.name !== undefined) updateData.name = body.name.trim()
    if (body.url !== undefined) updateData.url = body.url.trim()
    if (body.type !== undefined) updateData.type = body.type
    if (body.intervalSeconds !== undefined) updateData.intervalSeconds = parseInt(body.intervalSeconds, 10)
    if (body.timeoutSeconds !== undefined) updateData.timeoutSeconds = parseInt(body.timeoutSeconds, 10)
    if (body.enabled !== undefined) updateData.enabled = body.enabled
    if (body.visibility !== undefined) updateData.visibility = body.visibility === 'private' ? 'private' : 'public'

    const updated = db.update(monitors)
      .set(updateData)
      .where(eq(monitors.id, id))
      .returning()
      .get()

    // Reschedule with new settings
    scheduleMonitor(updated.id, updated.intervalSeconds, updated.enabled)

    return updated
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: err.message })
  }
})
