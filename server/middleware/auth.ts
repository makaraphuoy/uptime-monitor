import { SESSION_COOKIE, getSessionUser } from '../utils/auth'

export default defineEventHandler((event) => {
  const path = event.node.req.url?.split('?')[0] ?? ''

  // Only protect API routes
  if (!path.startsWith('/api/')) return

  // These paths are always public
  const publicPaths = ['/api/auth/', '/api/public/', '/api/health']
  if (publicPaths.some(p => path.startsWith(p))) return

  const token = getCookie(event, SESSION_COOKIE)
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const user = getSessionUser(token)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Session expired' })
  }

  event.context.user = user
})
