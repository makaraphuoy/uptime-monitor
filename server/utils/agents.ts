import { db } from '../db/index'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

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
  message: string
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
  type: 'http' | 'tcp' | 'ping',
  url: string,
  timeoutSeconds: number,
  regions: string[]
): Promise<AgentCheckResult[]> {
  const agents = readAgents().filter(a => regions.includes(a.region))
  if (agents.length === 0) return []

  const results = await Promise.allSettled(
    agents.map(async (agent): Promise<AgentCheckResult> => {
      const res = await fetch(`${agent.url}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${agent.token}`,
        },
        body: JSON.stringify({ type, url, timeout: timeoutSeconds * 1000 }),
        signal: AbortSignal.timeout((timeoutSeconds + 5) * 1000),
      })
      if (!res.ok) throw new Error(`Agent ${agent.region} responded ${res.status}`)
      const data = await res.json() as { status: string; responseTime: number; message: string }
      return {
        region: agent.region,
        status: data.status as 'up' | 'down',
        responseTimeMs: data.responseTime,
        message: data.message,
      }
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<AgentCheckResult> => r.status === 'fulfilled')
    .map(r => r.value)
}

export function majorityStatus(results: AgentCheckResult[]): 'up' | 'down' {
  if (results.length === 0) return 'down'
  const downCount = results.filter(r => r.status === 'down').length
  return downCount >= Math.ceil(results.length / 2) ? 'down' : 'up'
}
