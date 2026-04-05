export function parseRegions(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || '["asia"]')
    return Array.isArray(parsed) ? parsed : ['asia']
  } catch {
    return ['asia']
  }
}
