import { readAgents } from '../../../utils/agents'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const agent = readAgents().find(a => a.id === id)
  if (!agent) throw createError({ statusCode: 404, statusMessage: 'Agent not found' })

  try {
    const res = await fetch(`${agent.url}/health`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return { ok: true, ...data }
  } catch (err: any) {
    return { ok: false, message: err?.message ?? 'Unreachable' }
  }
})
