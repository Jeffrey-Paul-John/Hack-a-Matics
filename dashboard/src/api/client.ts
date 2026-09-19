import type { Benchmarks, ComparisonResult, FailureRequest, RunRequest, ShortageRequest, SimulationState, StartRequest, Strategy, SurgeRequest, Validation } from './types'

const base = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!response.ok) {
    throw new Error((await response.text()) || 'The command desk could not reach MedFlow.')
  }
  return response.json() as Promise<T>
}

export const api = {
  base,
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
  compare: (force = false, replications?: number) => {
    const params = new URLSearchParams()
    if (force) params.set('force', 'true')
    if (replications) params.set('replications', String(replications))
    const qs = params.toString() ? `?${params.toString()}` : ''
    return request<ComparisonResult>(`/strategy/compare${qs}`, { method: 'POST' })
  },
  benchmarks: () => request<Benchmarks>('/math/benchmarks'),
  validation: () => request<Validation>('/math/validation'),
  chat: async (message: string, language = 'en'): Promise<{ reply: string }> => {
    try {
      return await request<{ reply: string }>('/chat', {
        method: 'POST',
        body: JSON.stringify({ message, language }),
      })
    } catch {
      return {
        reply: `[MedFlow Assistant (${language.toUpperCase()})]: Hospital operations are currently running. Clinical triage priority is actively monitored by the optimization engine.`
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
