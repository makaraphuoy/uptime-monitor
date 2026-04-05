import { db } from '../../db/index'
import { monitors } from '../../db/schema'
import { scheduleMonitor } from '../../plugins/scheduler'
import { parseRegions } from '../../utils/regions'

export default defineEventHandler(async (event) => {
  // event.context.user populated by server/middleware/auth.ts
  try {
    const body = await readBody(event)

    if (!body.name || !body.url) {
      throw createError({ statusCode: 400, statusMessage: 'Name and URL are required' })
    }

    const validTypes = ['http', 'tcp']
    if (body.type && !validTypes.includes(body.type)) {
      throw createError({ statusCode: 400, statusMessage: 'Type must be http or tcp' })
    }

    const validIntervals = [30, 60, 120, 300, 600, 1800, 3600]
    const intervalSeconds = body.intervalSeconds ? parseInt(body.intervalSeconds, 10) : 60
    const timeoutSeconds = body.timeoutSeconds ? parseInt(body.timeoutSeconds, 10) : 30

    const validRegions = ['europe', 'north-america', 'asia', 'australia']
    const regions: string[] = Array.isArray(body.regions)
      ? body.regions.filter((r: string) => validRegions.includes(r))
      : ['asia']

    const newMonitor = {
      name: body.name.trim(),
      url: body.url.trim(),
      type: (body.type || 'http') as 'http' | 'tcp',
      intervalSeconds,
      timeoutSeconds,
      enabled: body.enabled !== false,
      visibility: (body.visibility === 'private' ? 'private' : 'public') as 'public' | 'private',
      regions: JSON.stringify(regions.length ? regions : ['asia']),
      userId: event.context.user!.id,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const result = db.insert(monitors).values(newMonitor).returning().get()

    // Start scheduling if enabled
    if (result.enabled) {
      scheduleMonitor(result.id, result.intervalSeconds, true)
    }

    return { ...result, regions: parseRegions(result.regions) }
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: err.message })
  }
})
