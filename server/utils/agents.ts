import { db } from '../db/index'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

// Minimum number of regions that must be DOWN to trigger a notification
// when a monitor has multiple regions configured. Single-region monitors
// always notify on 1 down. Override via env: MULTI_REGION_DOWN_THRESHOLD=3
const MULTI_REGION_DOWN_THRESHOLD = parseInt(process.env.MULTI_REGION_DOWN_THRESHOLD || '2', 10)

export interface Agent {
  id: string
  name: string
  region: string
  url: string
  token: string
}

export interface AgentCheckResult {
  region: string
  status: 'up' | 'down'
  responseTimeMs: number
  statusCode?: number
  message: string
  attempts: number
  failures: number
}

const AGENTS_KEY = 'agents'

export function readAgents(): Agent[] {
  const row = db.select().from(settings).where(eq(settings.key, AGENTS_KEY)).get()
  if (!row) return []
  try {
    return JSON.parse(row.value) as Agent[]
  } catch {
    return []
  }
}

export function writeAgents(agents: Agent[]): void {
  db.insert(settings)
    .values({ key: AGENTS_KEY, value: JSON.stringify(agents) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(agents) } })
    .run()
}

export function addAgent(data: Omit<Agent, 'id'>): Agent[] {
  const agents = readAgents()
  agents.push({ id: randomUUID(), ...data })
  writeAgents(agents)
  return agents
}

export function removeAgent(id: string): Agent[] {
  const agents = readAgents().filter(a => a.id !== id)
  writeAgents(agents)
  return agents
}

export async function checkViaAgents(
  type: 'http' | 'tcp',
  url: string,
  timeoutSeconds: number,
  regions: string[],
): Promise<AgentCheckResult[]> {
  const agents = readAgents().filter(a => regions.includes(a.region))
  if (agents.length === 0) return []

  // The agent runs up to 3 attempts internally (MAX_TOTAL_BUDGET_MS = 20s).
  // Outer abort must be generous enough to cover that — fixed at 25s.
  const agentCallTimeoutMs = 25_000

  const results = await Promise.allSettled(
    agents.map(async (agent): Promise<AgentCheckResult> => {
      const res = await fetch(`${agent.url}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${agent.token}`,
        },
        body: JSON.stringify({
          type,
          url,
          timeout: timeoutSeconds * 1000,
          // retries / retryDelay use agent defaults (2 retries, 150ms delay)
        }),
        signal: AbortSignal.timeout(agentCallTimeoutMs),
      })

      if (!res.ok) throw new Error(`Agent ${agent.region} responded ${res.status}`)

      const data = await res.json() as {
        status: string
        responseTime: number
        statusCode?: number
        message: string
        attempts: number
        failures: number
      }

      return {
        region: agent.region,
        status: data.status as 'up' | 'down',
        responseTimeMs: data.responseTime,
        statusCode: data.statusCode,
        message: data.message,
        attempts: data.attempts ?? 1,
        failures: data.failures ?? 0,
      }
    })
  )

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`[Agents] ${agents[i].region} (${agents[i].url}) unreachable: ${r.reason?.message ?? r.reason}`)
    }
  })

  return results
    .filter((r): r is PromiseFulfilledResult<AgentCheckResult> => r.status === 'fulfilled')
    .map(r => r.value)
}

export function majorityStatus(results: AgentCheckResult[]): 'up' | 'down' {
  if (results.length === 0) return 'down'
  const downCount = results.filter(r => r.status === 'down').length
  const threshold = results.length === 1 ? 1 : MULTI_REGION_DOWN_THRESHOLD
  return downCount >= threshold ? 'down' : 'up'
}
