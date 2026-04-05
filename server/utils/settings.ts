import { existsSync, readFileSync, renameSync } from 'fs'
import { join } from 'path'
import { db } from '../db/index'
import { settings } from '../db/schema'

export interface AppSettings {
  defaultIntervalSeconds: number
  webhookType: 'discord' | 'slack' | 'telegram' | 'generic'
  webhookUrl: string
  telegramBotToken: string
  telegramChatId: string
}

const defaults: AppSettings = {
  defaultIntervalSeconds: 60,
  webhookType: 'discord',
  webhookUrl: '',
  telegramBotToken: '',
  telegramChatId: '',
}

// In-memory cache — invalidated by writeSettings()
let _cache: AppSettings | null = null

// One-time migration: import data/settings.json into the DB then rename it
function migrateFromFile() {
  const file = join(process.cwd(), 'data', 'settings.json')
  if (!existsSync(file)) return
  try {
    const saved = JSON.parse(readFileSync(file, 'utf-8')) as Partial<AppSettings>
    const merged = { ...defaults, ...saved }
    for (const [key, value] of Object.entries(merged)) {
      db.insert(settings)
        .values({ key, value: String(value) })
        .onConflictDoUpdate({ target: settings.key, set: { value: String(value) } })
        .run()
    }
    renameSync(file, file + '.migrated')
  } catch {
    // ignore — fall back to defaults
  }
}

export function readSettings(): AppSettings {
  if (_cache) return _cache

  migrateFromFile()

  const rows = db.select().from(settings).all()
  if (rows.length === 0) {
    _cache = { ...defaults }
    return _cache
  }

  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
  _cache = {
    defaultIntervalSeconds: map.defaultIntervalSeconds ? Number(map.defaultIntervalSeconds) : defaults.defaultIntervalSeconds,
    webhookType: (map.webhookType as AppSettings['webhookType']) ?? defaults.webhookType,
    webhookUrl: map.webhookUrl ?? defaults.webhookUrl,
    telegramBotToken: map.telegramBotToken ?? defaults.telegramBotToken,
    telegramChatId: map.telegramChatId ?? defaults.telegramChatId,
  }
  return _cache
}

export function writeSettings(data: Partial<AppSettings>): AppSettings {
  const next = { ...readSettings(), ...data }
  for (const [key, value] of Object.entries(next)) {
    db.insert(settings)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: settings.key, set: { value: String(value) } })
      .run()
  }
  _cache = next
  return next
}
