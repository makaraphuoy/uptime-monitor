import { randomBytes, scryptSync } from 'node:crypto'
import { db } from '../../db/index'
import { users } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { verifyPassword, createSession, setSessionCookie } from '../../utils/auth'

// Timing-safe dummy hash — prevents username enumeration via response-time differences.
// Use a pre-computed value from DUMMY_HASH env var, or generate one at startup.
const DUMMY_HASH = (() => {
  if (process.env.DUMMY_HASH) return process.env.DUMMY_HASH
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(randomBytes(32), salt, 64).toString('hex')
  return `${salt}:${hash}`
})()

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string }>(event)

  if (!body?.username || !body?.password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password are required' })
  }

  const user = db.select().from(users).where(eq(users.username, body.username)).get()

  // Always run verifyPassword to prevent timing-based username enumeration
  const valid = user
    ? verifyPassword(body.password, user.passwordHash)
    : (verifyPassword(body.password, DUMMY_HASH), false)

  if (!user || !valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid username or password' })
  }

  const token = createSession(user.id)
  setSessionCookie(event, token)

  return { id: user.id, username: user.username }
})
