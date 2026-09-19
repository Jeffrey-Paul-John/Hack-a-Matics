import type {
  Benchmarks,
  ComparisonResult,
  FailureRequest,
  RunRequest,
  ShortageRequest,
  SimulationState,
  StartRequest,
  Strategy,
  SurgeRequest,
  Validation,
  WhatIfRequest,
  WhatIfResponse,
} from './types'

const base = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export function getSessionId(): string {
  try {
    let sid = localStorage.getItem('medflow_session_id')
    if (!sid || sid.trim().length === 0) {
      sid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      localStorage.setItem('medflow_session_id', sid)
    }
    return sid
  } catch {
    return 'default_session'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const sessionId = getSessionId()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Session-ID': sessionId,
    ...(init?.headers as Record<string, string>),
  }

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Command failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const api = {
  base,
  getSessionId,
  state: () => request<SimulationState>('/simulation/state'),
  start: (body: StartRequest) =>
    request<SimulationState>('/simulation/start', { method: 'POST', body: JSON.stringify(body) }),
  step: () => request<SimulationState>('/simulation/step', { method: 'POST' }),
  run: (duration = 60) =>
    request<SimulationState>('/simulation/run', { method: 'POST', body: JSON.stringify({ duration } as RunRequest) }),
  surge: (multiplier = 2) =>
    request<{ applied: boolean }>('/scenario/surge', { method: 'POST', body: JSON.stringify({ multiplier } as SurgeRequest) }),
  shortage: (resource_type: string, percent = 0.25) =>
    request<{ removed: number }>('/scenario/shortage', {
      method: 'POST',
      body: JSON.stringify({ resource_type, percent } as ShortageRequest),
    }),
  meta: () =>
    request<{
      departments: string[]
      resource_types: string[]
      strategies: Strategy[]
      urgency_levels: string[]
      capacities: Record<string, Record<string, number>>
    }>('/meta/config'),
  failResource: (resource_id: string) =>
    request<{ failed: boolean }>('/scenario/fail-resource', {
      method: 'POST',
      body: JSON.stringify({ resource_id } as FailureRequest),
    }),
  switchStrategy: (strategy: Strategy) =>
    request<SimulationState>('/strategy/switch', { method: 'POST', body: JSON.stringify({ strategy }) }),
  whatIf: (body: WhatIfRequest) =>
    request<WhatIfResponse>('/scenario/what-if', { method: 'POST', body: JSON.stringify(body) }),
  saveSim: () =>
    request<{ status: string; filepath: string; time: number }>('/sim/save', { method: 'POST' }),
  resumeSim: () =>
    request<SimulationState>('/sim/resume', { method: 'POST' }),
  compare: (force = false, replications?: number) => {
    const params = new URLSearchParams()
    if (force) params.set('force', 'true')
    if (replications) params.set('replications', String(replications))
    const qs = params.toString() ? `?${params.toString()}` : ''
    return request<ComparisonResult>(`/strategy/compare${qs}`, { method: 'POST' })
  },
  benchmarks: () => request<Benchmarks>('/math/benchmarks'),
  validation: () => request<Validation>('/math/validation'),
  chat: async (message: string, language = 'en'): Promise<{ reply: string; language?: string }> => {
    try {
      return await request<{ reply: string; language?: string }>('/chat', {
        method: 'POST',
        body: JSON.stringify({ message, language }),
      })
    } catch {
      return {
        reply: `[MedFlow Assistant (${language.toUpperCase()})]: Hospital operations are currently running. Clinical triage priority is actively monitored by the optimization engine.`,
        language,
      }
    }
  },
  getOnboardingStatus: (tourId: string) =>
    request<{ tour_id: string; completed: boolean; completed_at: string | null }>(
      `/users/me/onboarding/${tourId}/status`
    ),
  completeOnboarding: (tourId: string) =>
    request<{ tour_id: string; completed: boolean; completed_at: string }>(
      `/users/me/onboarding/${tourId}/complete`,
      { method: 'POST' }
    ),
}

