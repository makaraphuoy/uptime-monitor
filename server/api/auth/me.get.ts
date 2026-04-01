import { getSessionToken, getSessionUser } from '../../utils/auth'

export default defineEventHandler((event) => {
  const token = getSessionToken(event)
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const user = getSessionUser(token)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Session expired' })

  return { id: user.id, username: user.username }
})
