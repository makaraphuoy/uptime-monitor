import { getSessionToken, deleteSession, clearSessionCookie } from '../../utils/auth'

export default defineEventHandler((event) => {
  const token = getSessionToken(event)
  if (token) deleteSession(token)
  clearSessionCookie(event)
  return { ok: true }
})
