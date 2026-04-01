import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { db } from '../db/index'
import { sessions, users } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

export const SESSION_COOKIE = 'uptime_session'

// Password hashing 

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    const attempt = scryptSync(password, salt, 64)
    return timingSafeEqual(Buffer.from(hash, 'hex'), attempt)
  } catch {
    return false
  }
}

// Session management 

export function createSession(userId: number): string {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days server-side
  db.insert(sessions).values({ token, userId, expiresAt }).run()
  return token
}

export function deleteSession(token: string): void {
  db.delete(sessions).where(eq(sessions.token, token)).run()
}

export function getSessionUser(token: string) {
  // Use plain selects — avoids relational query API quirks with better-sqlite3
  const session = db.select().from(sessions).where(eq(sessions.token, token)).get()
  if (!session) return null
  if (session.expiresAt < new Date()) {
    deleteSession(token)
    return null
  }
  const user = db.select().from(users).where(eq(users.id, session.userId)).get()
  return user ?? null
}

// Cookie helpers ─

export function getSessionToken(event: H3Event): string | undefined {
  return getCookie(event, SESSION_COOKIE)
}

export function setSessionCookie(event: H3Event, token: string): void {
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // No maxAge → session cookie (dies when browser closes)
  })
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}
