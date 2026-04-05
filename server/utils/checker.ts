export interface CheckResult {
  status: 'up' | 'down'
  responseTimeMs: number
  message: string
}

export async function checkHttp(url: string, timeoutSeconds: number): Promise<CheckResult> {
  const start = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000)

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'UptimeMonitor/1.0'
      }
    })
    clearTimeout(timeoutId)
    const responseTimeMs = Date.now() - start
    const status = response.status < 400 ? 'up' : 'down'
    return {
      status,
      responseTimeMs,
      message: `HTTP ${response.status} ${response.statusText}`
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    const responseTimeMs = Date.now() - start
    const message = err.name === 'AbortError'
      ? `Timeout after ${timeoutSeconds}s`
      :  ((err.cause as any)?.code || err.message || 'Connection failed')//(err.message || 'Connection failed')
    return {
      status: 'down',
      responseTimeMs,
      message
    }
  }
}

export async function checkTcp(host: string, port: number, timeoutSeconds: number): Promise<CheckResult> {
  const start = Date.now()

  return new Promise((resolve) => {
    // Use dynamic import for net (Node.js only)
    import('net').then(({ createConnection }) => {
      const socket = createConnection({ host, port })
      const timeoutId = setTimeout(() => {
        socket.destroy()
        resolve({
          status: 'down',
          responseTimeMs: Date.now() - start,
          message: `TCP timeout after ${timeoutSeconds}s`
        })
      }, timeoutSeconds * 1000)

      socket.on('connect', () => {
        clearTimeout(timeoutId)
        socket.destroy()
        resolve({
          status: 'up',
          responseTimeMs: Date.now() - start,
          message: `TCP connection successful`
        })
      })

      socket.on('error', (err) => {
        clearTimeout(timeoutId)
        resolve({
          status: 'down',
          responseTimeMs: Date.now() - start,
          message: err.message || 'TCP connection failed'
        })
      })
    }).catch((err) => {
      resolve({
        status: 'down',
        responseTimeMs: Date.now() - start,
        message: `TCP check unavailable: ${err.message}`
      })
    })
  })
}

export function parseTcpUrl(url: string): { host: string; port: number } | null {
  try {
    // Support formats: tcp://host:port OR host:port
    let cleaned = url.replace(/^tcp:\/\//i, '')
    const parts = cleaned.split(':')
    if (parts.length === 2) {
      const port = parseInt(parts[1], 10)
      if (!isNaN(port) && port > 0 && port <= 65535) {
        return { host: parts[0], port }
      }
    }
    return null
  } catch {
    return null
  }
}

export async function performCheck(
  type: 'http' | 'tcp',
  url: string,
  timeoutSeconds: number
): Promise<CheckResult> {
  if (type === 'tcp') {
    const parsed = parseTcpUrl(url)
    if (!parsed) {
      return {
        status: 'down',
        responseTimeMs: 0,
        message: 'Invalid TCP URL format. Use host:port or tcp://host:port'
      }
    }
    return checkTcp(parsed.host, parsed.port, timeoutSeconds)
  } else {
    return checkHttp(url, timeoutSeconds)
  }
}
