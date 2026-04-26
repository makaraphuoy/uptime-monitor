import { removeAgent } from '../../utils/agents'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing agent id' })
  return removeAgent(id)
})
