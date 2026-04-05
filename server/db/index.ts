import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { resolve } from 'path'
import { mkdirSync } from 'fs'
import { randomBytes, scryptSync } from 'node:crypto'
import * as schema from './schema'

// DATA_DIR should be set to an absolute path in production so the database
// location never changes regardless of the process working directory.
const dataDir = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : resolve(process.cwd(), 'data')

mkdirSync(dataDir, { recursive: true })

const dbPath = resolve(dataDir, 'sqlite.db')
console.log('[DB] Database path:', dbPath)
const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// Create tables 

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS monitors (
    id               INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name             TEXT    NOT NULL,
    url              TEXT    NOT NULL,
    type             TEXT    NOT NULL DEFAULT 'http',
    interval_seconds INTEGER NOT NULL DEFAULT 60,
    timeout_seconds  INTEGER NOT NULL DEFAULT 30,
    enabled          INTEGER NOT NULL DEFAULT true,
    created_at       INTEGER,
    updated_at       INTEGER
  );

  CREATE TABLE IF NOT EXISTS heartbeats (
    id               INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    monitor_id       INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    status           TEXT    NOT NULL DEFAULT 'pending',
    response_time_ms INTEGER,
    checked_at       INTEGER,
    message          TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    token      TEXT    NOT NULL UNIQUE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER
  );
`)

// Safe column additions (idempotent ALTER TABLE) ─

// Heartbeat column additions
const heartbeatCols = (sqlite.pragma('table_info(heartbeats)') as { name: string }[]).map(c => c.name)

if (!heartbeatCols.includes('duration_ms')) {
  sqlite.exec(`ALTER TABLE heartbeats ADD COLUMN duration_ms INTEGER`)
  // Backfill: estimate duration as (checked_at - previous checked_at) per monitor, capped at interval * 2
  sqlite.exec(`
    UPDATE heartbeats SET duration_ms = (
      SELECT MIN((heartbeats.checked_at - prev.checked_at), m.interval_seconds * 2000)
      FROM heartbeats prev
      JOIN monitors m ON m.id = heartbeats.monitor_id
      WHERE prev.monitor_id = heartbeats.monitor_id
        AND prev.checked_at < heartbeats.checked_at
      ORDER BY prev.checked_at DESC
      LIMIT 1
    )
    WHERE duration_ms IS NULL AND checked_at IS NOT NULL
  `)
  console.log('[DB] Added duration_ms column to heartbeats and backfilled estimates')
}

const monitorCols = (sqlite.pragma('table_info(monitors)') as { name: string }[]).map(c => c.name)

if (!monitorCols.includes('user_id')) {
  sqlite.exec(`ALTER TABLE monitors ADD COLUMN user_id INTEGER REFERENCES users(id)`)
  console.log('[DB] Added user_id column to monitors')
}
if (!monitorCols.includes('visibility')) {
  sqlite.exec(`ALTER TABLE monitors ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'`)
  console.log('[DB] Added visibility column to monitors')
}
if (!monitorCols.includes('regions')) {
  sqlite.exec(`ALTER TABLE monitors ADD COLUMN regions TEXT DEFAULT '["asia"]'`)
  console.log('[DB] Added regions column to monitors')
}

// Seed admin user (only if no users exist) ─

const userCount = (sqlite.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number }).n

if (userCount === 0) {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin'
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin'

  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(adminPassword, salt, 64).toString('hex')
  const admin = sqlite.prepare(
    'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?) RETURNING id'
  ).get(adminUsername, `${salt}:${hash}`, Date.now()) as { id: number }

  // Assign all existing monitors to the admin user
  sqlite.prepare('UPDATE monitors SET user_id = ? WHERE user_id IS NULL').run(admin.id)

  console.log(`[DB] Seeded admin user — username: ${adminUsername} / password: ${adminPassword}`)
  console.log('[DB] All existing monitors assigned to admin (id:', admin.id, ')')
}

// Indexes (idempotent) ─

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS heartbeats_monitor_checked_idx ON heartbeats (monitor_id, checked_at);
  CREATE INDEX IF NOT EXISTS monitors_user_id_idx ON monitors (user_id);
  CREATE INDEX IF NOT EXISTS monitors_visibility_idx ON monitors (visibility);
`)

console.log('[DB] Tables ready')

// Export ─

export const db = drizzle(sqlite, { schema })
export { sqlite }
