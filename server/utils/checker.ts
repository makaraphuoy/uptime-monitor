const DEFAULT_RETRIES    = 2
const DEFAULT_RETRY_DELAY = 150  // ms
const MAX_RETRIES        = 5
const MAX_TOTAL_BUDGET_MS = 20_000

export interface AttemptDetail {
  success: boolean
  responseTimeMs?: number
  statusCode?: number
  error?: string
}

export interface CheckResult {
  status: 'up' | 'down'
  responseTimeMs: number
  statusCode?: number
  message: string
  attempts: number
  failures: number
  attemptDetails: AttemptDetail[]
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function classifyError(err: any, timeoutMs: number): string {
  if (err?.name === 'AbortError')    return `Timed out after ${timeoutMs}ms`
  if (err?.code === 'ENOTFOUND')     return 'DNS lookup failed'
  if (err?.code === 'ECONNREFUSED')  return 'Connection refused'
  if (err?.code === 'ECONNRESET')    return 'Connection reset'
  return (err?.cause as any)?.code ?? err?.message ?? 'Request failed'
}

// ── HTTP ──────────────────────────────────────────────────────────────────

interface AttemptResult {
  success: boolean
  responseTimeMs: number
  statusCode?: number
  message: string
}

async function attemptHttp(url: string, timeoutMs: number): Promise<AttemptResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const start = performance.now()

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'UptimeMonitor/1.0' },
    })
    clearTimeout(timer)
    res.body?.cancel().catch(() => {})

    const responseTimeMs = Math.round(performance.now() - start)
    const ok = res.status < 400
    return { success: ok, responseTimeMs, statusCode: res.status, message: `HTTP ${res.status} ${res.statusText}` }
  } catch (err: any) {
    clearTimeout(timer)
    return {
      success: false,
      responseTimeMs: Math.round(performance.now() - start),
      message: classifyError(err, timeoutMs),
    }
  }
}

async function checkHttp(url: string, timeoutMs: number, retries: number, retryDelay: number): Promise<CheckResult> {
  const maxAttempts = 1 + retries
  const attemptDetails: AttemptDetail[] = []
  let last!: AttemptResult

  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await delay(retryDelay)

    last = await attemptHttp(url, timeoutMs)

    if (last.success) {
      attemptDetails.push({ success: true, responseTimeMs: last.responseTimeMs, statusCode: last.statusCode })
      break
    }
    attemptDetails.push({ success: false, statusCode: last.statusCode, error: last.message })
  }

  const failures = attemptDetails.filter(a => !a.success).length
  const successDetail = attemptDetails.find(a => a.success)

  return {
    status: last.success ? 'up' : 'down',
    responseTimeMs: successDetail?.responseTimeMs ?? last.responseTimeMs,
    statusCode: last.statusCode,
    message: last.message,
    attempts: attemptDetails.length,
    failures,
    attemptDetails,
  }
}

// ── TCP ───────────────────────────────────────────────────────────────────

async function attemptTcp(host: string, port: number, timeoutMs: number): Promise<AttemptResult> {
  const start = performance.now()
  return new Promise(resolve => {
    import('net').then(({ createConnection }) => {
      const socket = createConnection({ host, port })
      const timer = setTimeout(() => {
        socket.destroy()
        resolve({ success: false, responseTimeMs: Math.round(performance.now() - start), message: `Timed out after ${timeoutMs}ms` })
      }, timeoutMs)

      socket.once('connect', () => {
        clearTimeout(timer)
        socket.destroy()
        resolve({ success: true, responseTimeMs: Math.round(performance.now() - start), message: 'TCP connection successful' })
      })

      socket.once('error', (err) => {
        clearTimeout(timer)
        socket.destroy()
        resolve({ success: false, responseTimeMs: Math.round(performance.now() - start), message: err.message })
      })
    }).catch((err) => {
      resolve({ success: false, responseTimeMs: Math.round(performance.now() - start), message: `TCP unavailable: ${err.message}` })
    })
  })
}

export function parseTcpUrl(url: string): { host: string; port: number } | null {
  try {
    const cleaned = url.replace(/^tcp:\/\//i, '')
    const lastColon = cleaned.lastIndexOf(':')
    if (lastColon === -1) return null
    const port = parseInt(cleaned.slice(lastColon + 1), 10)
    if (isNaN(port) || port < 1 || port > 65535) return null
    return { host: cleaned.slice(0, lastColon), port }
  } catch {
    return null
  }
}

async function checkTcp(host: string, port: number, timeoutMs: number, retries: number, retryDelay: number): Promise<CheckResult> {
  const maxAttempts = 1 + retries
  const attemptDetails: AttemptDetail[] = []
  let last!: AttemptResult

  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await delay(retryDelay)

    last = await attemptTcp(host, port, timeoutMs)

    if (last.success) {
      attemptDetails.push({ success: true, responseTimeMs: last.responseTimeMs })
      break
    }
    attemptDetails.push({ success: false, error: last.message })
  }

  const failures = attemptDetails.filter(a => !a.success).length
  const successDetail = attemptDetails.find(a => a.success)

  return {
    status: last.success ? 'up' : 'down',
    responseTimeMs: successDetail?.responseTimeMs ?? last.responseTimeMs,
    message: last.message,
    attempts: attemptDetails.length,
    failures,
    attemptDetails,
  }
}

// ── Entry point ───────────────────────────────────────────────────────────

export async function performCheck(
  type: 'http' | 'tcp',
  url: string,
  timeoutSeconds: number,
): Promise<CheckResult> {
  const timeoutMs = timeoutSeconds * 1000
  const clampedRetries = Math.min(DEFAULT_RETRIES, MAX_RETRIES)

  // Cap retries so total budget stays within MAX_TOTAL_BUDGET_MS
  const maxAffordableAttempts = Math.max(1, Math.floor(MAX_TOTAL_BUDGET_MS / (timeoutMs + DEFAULT_RETRY_DELAY)))
  const safeRetries = Math.min(clampedRetries, maxAffordableAttempts - 1)

  if (type === 'tcp') {
    const parsed = parseTcpUrl(url)
    if (!parsed) {
      return {
        status: 'down',
        responseTimeMs: 0,
        message: 'Invalid TCP URL format. Use host:port or tcp://host:port',
        attempts: 1,
        failures: 1,
        attemptDetails: [{ success: false, error: 'Invalid TCP URL format' }],
      }
    }
    return checkTcp(parsed.host, parsed.port, timeoutMs, safeRetries, DEFAULT_RETRY_DELAY)
  }

  return checkHttp(url, timeoutMs, safeRetries, DEFAULT_RETRY_DELAY)
}
