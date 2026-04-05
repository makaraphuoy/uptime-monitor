import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

// Users 

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Sessions 

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token: text('token').notNull().unique(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Monitors 

export const monitors = sqliteTable('monitors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  type: text('type', { enum: ['http', 'tcp'] }).notNull().default('http'),
  intervalSeconds: integer('interval_seconds').notNull().default(60),
  timeoutSeconds: integer('timeout_seconds').notNull().default(30),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  visibility: text('visibility', { enum: ['public', 'private'] }).notNull().default('public'),
  regions: text('regions').default('["asia"]'),
  userId: integer('user_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => ({
  userIdIdx:    index('monitors_user_id_idx').on(t.userId),
  visibilityIdx: index('monitors_visibility_idx').on(t.visibility),
}))

// Heartbeats 

export const heartbeats = sqliteTable('heartbeats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  monitorId: integer('monitor_id')
    .notNull()
    .references(() => monitors.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['up', 'down', 'pending'] }).notNull().default('pending'),
  responseTimeMs: integer('response_time_ms'),
  durationMs: integer('duration_ms'),
  checkedAt: integer('checked_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  message: text('message'),
}, (t) => ({
  // Covers all queries: filter by monitor + sort/range by time
  monitorCheckedAtIdx: index('heartbeats_monitor_checked_idx').on(t.monitorId, t.checkedAt),
}))

// Relations ─

export const usersRelations = relations(users, ({ many }) => ({
  monitors: many(monitors),
  sessions: many(sessions),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

export const monitorsRelations = relations(monitors, ({ one, many }) => ({
  user: one(users, { fields: [monitors.userId], references: [users.id] }),
  heartbeats: many(heartbeats),
}))

export const heartbeatsRelations = relations(heartbeats, ({ one }) => ({
  monitor: one(monitors, { fields: [heartbeats.monitorId], references: [monitors.id] }),
}))

// Settings

export const settings = sqliteTable('settings', {
  key:   text('key').primaryKey().notNull(),
  value: text('value').notNull(),
})

// Types

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Monitor = typeof monitors.$inferSelect
export type NewMonitor = typeof monitors.$inferInsert
export type Heartbeat = typeof heartbeats.$inferSelect
export type NewHeartbeat = typeof heartbeats.$inferInsert
