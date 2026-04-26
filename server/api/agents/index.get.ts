import { readAgents } from '../../utils/agents'

export default defineEventHandler(() => {
  return readAgents()
})
