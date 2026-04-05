import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

export interface AppSettings {
  defaultIntervalSeconds: number
  webhookType: 'discord' | 'slack' | 'telegram' | 'generic'
  // Discord / Slack / Generic
  webhookUrl: string
  // Telegram
  telegramBotToken: string
  telegramChatId: string
}

const SETTINGS_FILE = join(process.cwd(), 'data', 'settings.json')

const defaults: AppSettings = {
  defaultIntervalSeconds: 60,
  webhookType: 'discord',
  webhookUrl: '',
  telegramBotToken: '',
  telegramChatId: '',
}

// In-memory cache — avoids hitting disk on every notification check.
// Invalidated by writeSettings() so it always reflects the latest saved value.
let _cache: AppSettings | null = null

export function readSettings(): AppSettings {
  if (_cache) return _cache
  try {
    if (!existsSync(SETTINGS_FILE)) {
      _cache = { ...defaults }
      return _cache
    }
    _cache = { ...defaults, ...JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) }
    return _cache
  } catch {
    _cache = { ...defaults }
    return _cache
  }
}

export function writeSettings(settings: Partial<AppSettings>): AppSettings {
  const next = { ...readSettings(), ...settings }
  const dir = join(process.cwd(), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2))
  _cache = next
  return next
}
