import { addAgent } from '../../utils/agents'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as { name?: string; region?: string; url?: string; token?: string }

  if (!body.name || !body.region || !body.url || !body.token) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields: name, region, url, token' })
  }

  const url = body.url.replace(/\/$/, '')
  return addAgent({ name: body.name, region: body.region, url, token: body.token })
})
