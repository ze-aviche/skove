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
  type: 'string' | 'number' | 'select' | 'boolean' | 'date' | 'airport' | 'city' | 'location-tags'
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
  instanceId: string | null
  userId: string
  title: string
  value?: string
  url?: string
  metadata?: Record<string, unknown>
  isRead: boolean
  isFavourite: boolean
  createdAt: string
}

export type AtsJob = {
  id: string
  source: string
  externalId?: string
  applyUrl: string
  title: string
  company: string
  location: string
  salaryMin?: number
  salaryMax?: number
  description?: string
  postedAt: string
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

export function deleteResult(resultId: string, token?: string): Promise<{ id: string }> {
  return fetchJson(`/api/results/${resultId}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export function deleteResults(ids: string[], token?: string): Promise<{ deleted: number }> {
  return fetchJson('/api/results/bulk', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
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

// ── Billing ──────────────────────────────────────────────────────────────────

export type UserPlan = { plan: string; stripeCustomerId: string | null; planExpiresAt: string | null }

export function getBillingPlan(token?: string): Promise<UserPlan> {
  return fetchJson('/api/billing/plan', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
}

export function createCheckoutSession(token?: string): Promise<{ url: string }> {
  return fetchJson('/api/billing/checkout', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export function createBillingPortalSession(token?: string): Promise<{ url: string }> {
  return fetchJson('/api/billing/portal', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

// ── Admin ────────────────────────────────────────────────────────────────────

export type AdminUser = {
  id: string
  email: string
  plan: string
  agentCount: number
  resultCount: number
  createdAt: string
  planExpiresAt: string | null
}

export type AdminStats = { totalUsers: number; totalAgents: number; totalResults: number; proUsers: number }

export function getAdminStats(token?: string): Promise<AdminStats> {
  return fetchJson('/api/admin/stats', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
}

export function getAdminUsers(token?: string): Promise<AdminUser[]> {
  return fetchJson('/api/admin/users', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
}

export function adminChangePlan(userId: string, plan: string, token?: string): Promise<{ id: string; plan: string }> {
  return fetchJson(`/api/admin/users/${userId}/plan`, {
    method: 'PATCH',
    body: JSON.stringify({ plan }),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export function adminDeleteUser(userId: string, token?: string): Promise<{ id: string }> {
  return fetchJson(`/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

// ── Resume ───────────────────────────────────────────────────────────────────

export function getResumeStatus(token?: string): Promise<{ hasResume: boolean; wordCount: number }> {
  return fetchJson('/api/resume', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
}

export async function downloadDocument(
  resultId: string,
  type: 'resume' | 'cover',
  format: 'pdf' | 'docx',
  filename: string,
  token?: string,
): Promise<void> {
  const res = await fetch(`${apiUrl}/api/download/${resultId}?type=${type}&format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function scoreResult(resultId: string, token?: string): Promise<{ already: boolean; metadata: Record<string, unknown> }> {
  return fetchJson(`/api/results/${resultId}/score`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export function toggleFavourite(resultId: string, token?: string): Promise<AgentResult> {
  return fetchJson<AgentResult>(`/api/results/${resultId}/favourite`, {
    method: 'PATCH',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export function fetchSuggestions(field: 'title' | 'company', q: string, token?: string): Promise<string[]> {
  return fetchJson(`/api/jobs/suggestions?field=${field}&q=${encodeURIComponent(q)}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
}

export function searchJobs(
  params: { title?: string; company?: string; location?: string; specialization?: string; page?: number; limit?: number },
  token?: string,
): Promise<{ jobs: AtsJob[]; total: number; page: number; limit: number }> {
  const qs = new URLSearchParams()
  if (params.title)         qs.set('title',         params.title)
  if (params.company)       qs.set('company',       params.company)
  if (params.location)      qs.set('location',      params.location)
  if (params.specialization) qs.set('specialization', params.specialization)
  if (params.page)          qs.set('page',          String(params.page))
  if (params.limit)         qs.set('limit',         String(params.limit))
  return fetchJson(`/api/jobs/search?${qs}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
}

export function saveAndScoreJob(
  atsJobId: string,
  token?: string,
): Promise<{ result: AgentResult; created: boolean; alreadyScored: boolean }> {
  return fetchJson(`/api/jobs/${atsJobId}/save-and-score`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

// ── ATS Pipeline (admin) ─────────────────────────────────────────────────────

export type AtsStatus = {
  jobsInDb: number
  enabledCompanies: number
  neverFetched: number
  lastFetchedAt: string | null
}

export function getAtsStatus(token?: string): Promise<AtsStatus> {
  return fetchJson('/api/admin/ats/status', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
}

export function triggerAtsRefresh(token?: string): Promise<{ message: string }> {
  return fetchJson('/api/admin/ats/refresh', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
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
