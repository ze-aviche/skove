export const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const defaultHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  const headers = { ...defaultHeaders, ...(options.headers || {}) } as Record<string, string>

  const res = await fetch(`${apiUrl}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API fetch failed ${res.status}: ${res.statusText} ${text}`)
  }

  return res.json()
}

export type AgentConfigField = {
  type: 'string' | 'number' | 'select' | 'boolean' | 'date' | 'airport'
  label: string
  required?: boolean
  placeholder?: string
  options?: string[]
  showWhen?: { field: string; value: string }
}

export type AgentDefinition = {
  id: string
  name: string
  description: string
  configSchema: Record<string, AgentConfigField>
  schedule: string
  authorId: string | null
  isPublished: boolean
  createdAt: string
}

export type AgentInstance = {
  id: string
  userId: string
  agentId: string
  config: Record<string, unknown>
  isActive: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
}

export type AgentResult = {
  id: string
  instanceId: string
  userId: string
  title: string
  value?: string
  url?: string
  metadata?: Record<string, unknown>
  isRead: boolean
  createdAt: string
}

export function getAgentDefinitions(token?: string): Promise<AgentDefinition[]> {
  return fetchJson<AgentDefinition[]>('/api/agents/definitions', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
}

export function getMyAgents(token?: string): Promise<AgentInstance[]> {
  return fetchJson<AgentInstance[]>('/api/agents/my', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
}

export function getResults(token?: string): Promise<AgentResult[]> {
  return fetchJson<AgentResult[]>('/api/results', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
}

export function deployAgent(agentId: string, config: Record<string, unknown> = {}, token?: string): Promise<AgentInstance> {
  return fetchJson<AgentInstance>('/api/agents/deploy', {
    method: 'POST',
    body: JSON.stringify({ agentId, config }),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export function toggleAgent(instanceId: string, token?: string): Promise<AgentInstance> {
  return fetchJson<AgentInstance>(`/api/agents/${instanceId}/toggle`, {
    method: 'PATCH',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export function updateAgentConfig(instanceId: string, config: Record<string, unknown>, token?: string): Promise<AgentInstance> {
  return fetchJson<AgentInstance>(`/api/agents/${instanceId}/config`, {
    method: 'PATCH',
    body: JSON.stringify({ config }),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export function deleteAgent(instanceId: string, token?: string): Promise<{ id: string }> {
  return fetchJson<{ id: string }>(`/api/agents/${instanceId}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export function markResultRead(resultId: string, token?: string): Promise<AgentResult> {
  return fetchJson<AgentResult>(`/api/results/${resultId}/read`, {
    method: 'PATCH',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export function runAgent(instanceId: string, token?: string): Promise<{ ran: boolean; results: AgentResult[] }> {
  return fetchJson<{ ran: boolean; results: AgentResult[] }>(`/api/agents/${instanceId}/run`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export function getResumeStatus(token?: string): Promise<{ hasResume: boolean; wordCount: number }> {
  return fetchJson('/api/resume', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
}

export async function uploadResume(file: File, token?: string): Promise<{ success: boolean; wordCount: number; pages: number }> {
  const form = new FormData()
  form.append('resume', file)

  const res = await fetch(`${apiUrl}/api/resume`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
    credentials: 'include',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Upload failed ${res.status}: ${text}`)
  }
  return res.json()
}
