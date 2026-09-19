export type Urgency = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW'
export type Strategy = 'urgency_only' | 'wait_aware' | 'resource_aware' | 'mdp_optimal'
export type ResourceStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'OUT_OF_SERVICE'

export interface QueuePatient {
  id: string
  urgency: Urgency
  score: number
  status: string
  wait_minutes?: number
}

export interface ResourceItem {
  id: string
  status: ResourceStatus
}

export interface ResourcePool {
  occupied: number
  total: number
  available?: number
  down?: number
  items?: ResourceItem[]
}

export interface Metrics {
  patients_completed: number
  average_wait_minutes: number
  average_treatment_minutes?: number
  wait_by_urgency: Record<string, { average: number; max: number }>
  sla_violations: number
  utilization: Record<string, number>
}

export interface WhatIfDelta {
  wait_minutes: number
  wait_change_percent: number
  sla_violations: number
  patients_completed: number
}

export interface WhatIfResponse {
  horizon_minutes: number
  adjustments: Record<string, Record<string, number>>
  strategy_override: string | null
  baseline: Metrics
  counterfactual: Metrics
  delta: WhatIfDelta
}

export interface SimulationState {
  now: string
  running: boolean
  queues: Record<string, QueuePatient[]>
  resources: Record<string, Record<string, ResourcePool>>
  metrics: Metrics
}

// Schemas mirroring FastAPI schemas.py field-for-field
export interface StartRequest {
  seed: number
  strategy: Strategy
}

export interface RunRequest {
  duration?: number
}

export interface SurgeRequest {
  multiplier?: number
}

export interface ShortageRequest {
  resource_type: string
  percent?: number
}

export interface FailureRequest {
  resource_id: string
}

export interface StrategyRequest {
  strategy: string
}

export interface WhatIfRequest {
  adjustments?: Record<string, Record<string, number>>
  strategy_override?: Strategy | null
  horizon_minutes?: number
}

export interface ComparisonMetric {
  mean: number
  std_dev: number
  ci95: [number, number]
}

export interface Comparison {
  n: number
  average_wait_minutes: ComparisonMetric
  utilization_percent: ComparisonMetric
  sla_violations: ComparisonMetric
}

export type ComparisonResult = Record<Strategy, Comparison>

export interface Benchmarks {
  erlang_c: {
    P_wait: number
    expected_wait: number | null
    utilization: number
  }
  erlang_b_icu: number
  units: string
}

export interface Validation {
  markov_expected_steps: Record<string, number>
  queueing: Benchmarks
  simulated_average_wait_minutes: number | null
  within_documented_tolerance: boolean | null
  little_law_sanity: boolean
}
