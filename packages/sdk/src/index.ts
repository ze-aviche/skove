// ─────────────────────────────────────────────
// @skove/sdk — Agent definition interface
// Any developer can use this to build a Skove agent
// ─────────────────────────────────────────────

export type FieldType = 'string' | 'number' | 'boolean' | 'select'

export interface ConfigField {
  type: FieldType
  label: string
  required?: boolean
  placeholder?: string
  options?: string[] // for 'select' type
  min?: number
  max?: number
}

export interface AgentResult {
  title: string
  value?: string     // e.g. "$241"
  url?: string       // link user can click
  metadata?: Record<string, unknown>
}

export interface AgentContext {
  userId: string
  instanceId: string
  log: (message: string) => void
}

export interface AgentDefinition<TConfig = Record<string, unknown>> {
  id: string
  name: string
  description: string
  icon?: string       // emoji
  category: 'travel' | 'jobs' | 'real-estate' | 'finance' | 'news' | 'custom'
  configSchema: Record<keyof TConfig & string, ConfigField>
  schedule: string    // cron expression e.g. "0 */2 * * *"
  run: (config: TConfig, ctx: AgentContext) => Promise<AgentResult[]>
}

export function defineAgent<TConfig = Record<string, unknown>>(
  definition: AgentDefinition<TConfig>
): AgentDefinition<TConfig> {
  return definition
}
