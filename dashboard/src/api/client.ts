import type {
  Benchmarks,
  ComparisonResult,
  ExperimentRequest,
  ExperimentResponse,
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

export function resolveApiBaseUrl(): string {
  // 1. Explicit VITE_API_URL or VITE_API_BASE_URL takes first priority
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL
  if (
    envUrl &&
    typeof envUrl === 'string' &&
    envUrl.trim().length > 0 &&
    !envUrl.includes('your-backend.onrender.com') &&
    !envUrl.includes('api.medflow.health')
  ) {
    return envUrl.trim().replace(/\/+$/, '')
  }

  // 2. Cloud production fallback (Vercel, Render, or Vite production mode)
  if (
    import.meta.env.PROD ||
    (typeof window !== 'undefined' &&
      window.location?.hostname &&
      (window.location.hostname.endsWith('.vercel.app') ||
        window.location.hostname.endsWith('.onrender.com') ||
        window.location.hostname.endsWith('.pages.dev') ||
        window.location.hostname.endsWith('.netlify.app')))
  ) {
    return 'https://hack-a-matics.onrender.com'
  }

  // 3. Dynamic hostname detection for LAN mobile browser testing (e.g. 192.168.x.x, 10.x.x.x)
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const { hostname, protocol } = window.location
    if (
      hostname &&
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      (hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.') ||
        hostname.endsWith('.local'))
    ) {
      const port = '8000'
      const scheme = protocol === 'https:' ? 'https' : 'http'
      return `${scheme}://${hostname}:${port}`
    }
  }

  // 4. Clean default for local dev
  return 'http://localhost:8000'
}

export function resolveWsUrl(apiBase: string, path: string = '/ws/live'): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  // Derive ws:// from http:// and wss:// from https://
  const wsBase = apiBase.replace(/^http(s?):\/\//i, 'ws$1://')
  return `${wsBase}${cleanPath}`
}

export const API_BASE_URL = resolveApiBaseUrl()

export function getWsUrl(path: string = '/ws/live'): string {
  return resolveWsUrl(API_BASE_URL, path)
}

const base = API_BASE_URL

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
  getWsUrl,
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
  chat: async (
    message: string,
    language = 'en'
  ): Promise<{ reply: string; language?: string; message_id?: string }> => {
    try {
      return await request<{ reply: string; language?: string; message_id?: string }>('/chat', {
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
  benchmarkExperiment: (body: ExperimentRequest) =>
    request<ExperimentResponse>('/experiment/benchmark', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  ttsConfig: () =>
    request<{
      enabled: boolean
      voices: Array<{ id: string; label: string; gender: string }>
      default_voice: string
      max_text_length: number
    }>('/tts/config'),
  ttsSpeak: async (
    body: {
      text?: string
      message_id?: string
      voice?: string
      language_code?: string
      pace?: number
    },
    signal?: AbortSignal
  ): Promise<Blob> => {
    const sessionId = getSessionId()
    const response = await fetch(`${base}/tts/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId,
      },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      const errText = await response.text()
      throw new Error(errText || `TTS failed with status ${response.status}`)
    }
    return response.blob()
  },
}

