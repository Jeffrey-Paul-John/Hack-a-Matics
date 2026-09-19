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

export interface Episode {
  episode_id: string
  patient_id?: string
  arrival_time: string
  admit_time: string
  discharge_time: string
  wait_min: number
  treatment_min: number
  los_min: number
  wait_minutes?: number
  treatment_minutes?: number
  total_minutes?: number
  acuity_initial: string
  acuity_final: string
  urgency?: string
  unit: string
  outcome: string
}

export interface Metrics {
  patients_completed: number
  average_wait_minutes: number
  censoring_aware_wait_minutes?: number
  p90_wait_minutes?: number
  end_queue_length?: number
  average_treatment_minutes?: number
  wait_by_urgency: Record<string, { average: number; max: number }>
  sla_violations: number
  utilization: Record<string, number>
  completed_episodes?: Episode[]
}

export interface WhatIfDelta {
  wait_minutes: number
  censoring_aware_wait_minutes?: number
  p90_wait_minutes?: number
  end_queue_length?: number
  wait_change_percent: number
  sla_violations: number
  patients_completed: number
}

export interface AppliedChange {
  department: string
  resource: string
  baseline: number
  counterfactual: number
  delta: number
  display: string
  no_demand?: boolean
}

export interface BottleneckInfo {
  department: string
  resource: string
  label: string
  utilization: number
  available: number
  total: number
  description: string
}

export interface ForkContext {
  total_waiting: number
  department_queues: Record<string, number>
  resource_utilization: Record<string, number>
  bottleneck: BottleneckInfo | null
}

export interface StatisticalSummary {
  replications: number
  mean_delta_wait: number
  ci_wait_95: [number, number]
  p_value_wait: number
  p_value_wait_formatted?: string
  wait_significant?: boolean

  mean_delta_censored_wait?: number
  ci_censored_wait_95?: [number, number]
  p_value_censored_wait?: number
  p_value_censored_wait_formatted?: string
  censored_wait_significant?: boolean

  mean_delta_queue?: number
  ci_queue_95?: [number, number]
  p_value_queue?: number
  p_value_queue_formatted?: string
  queue_significant?: boolean

  mean_delta_comp?: number
  ci_comp_95?: [number, number]
  p_value_comp?: number
  p_value_comp_formatted?: string
  comp_significant?: boolean

  mean_delta_sla?: number
  ci_sla_95?: [number, number]
  p_value_sla?: number
  p_value_sla_formatted?: string
  sla_significant?: boolean

  is_significant: boolean
  zero_variance?: {
    wait: boolean
    censored_wait?: boolean
    queue?: boolean
    comp: boolean
    sla: boolean
  }
  holm_bonferroni?: {
    adj_p_wait: number
    adj_p_comp: number
    adj_p_sla: number
    adj_p_censored_wait?: number
    adj_p_queue?: number
  }
}

export interface WhatIfMessage {
  type: 'empty_queue' | 'not_bottleneck' | 'significant' | 'improvement' | 'mixed' | 'worse' | 'no_demand'
  text: string
}

export interface WhatIfResponse {
  horizon_minutes: number
  replications?: number
  adjustments: Record<string, Record<string, number>>
  strategy_override: string | null
  baseline: Metrics
  counterfactual: Metrics
  delta: WhatIfDelta
  applied_changes?: AppliedChange[]
  fork_context?: ForkContext
  statistical_summary?: StatisticalSummary
  message?: WhatIfMessage
}

export interface SimulationState {
  now: string
  running: boolean
  queues: Record<string, QueuePatient[]>
  resources: Record<string, Record<string, ResourcePool>>
  metrics: Metrics
  episodes?: Episode[]
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
  resource_adjustments?: Record<string, Record<string, number>>
  strategy_override?: Strategy | null
  horizon_minutes?: number
  replications?: number
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

export interface MetricDistribution {
  mean: number
  std: number
  ci_lower: number
  ci_upper: number
}

export interface AcuityDistribution {
  mean: number | null
  std: number | null
  ci_lower: number | null
  ci_upper: number | null
}

export interface ReplicationDetail {
  seed: number
  strategy: string
  n_episodes: number
  n_discharged: number
  n_censored: number
  mean_wait_minutes: number
  p90_wait_minutes: number
  throughput_per_hour: number
  target_4hr_met_percent: number
  icu_blocking_probability: number
  wait_by_acuity: Record<string, number | null>
}

export interface PolicySummary {
  mean_wait_minutes: MetricDistribution
  p90_wait_minutes: MetricDistribution
  throughput_per_hour: MetricDistribution
  target_4hr_met_percent: MetricDistribution
  icu_blocking_probability: MetricDistribution
  censored_count_mean: number
  episodes_per_rep_mean: number
  wait_by_acuity: Record<string, AcuityDistribution>
  replications: ReplicationDetail[]
}

export interface PairedComparison {
  baseline_name: string
  n_pairs: number
  mean_diff: number
  cohens_d: number
  p_value_raw: number
  p_value_holm: number
  is_significant: boolean
  bootstrap_ci: {
    ci_lower: number
    ci_upper: number
    ci_level: number
    method: string
    n_boot: number
  }
}

export interface AcuityTierComparison {
  baseline_mean: number | null
  policy_mean: number | null
  diff_minutes: number
  pct_change: number
  status: 'improved' | 'worsened' | 'neutral' | 'insufficient_data'
}

export interface ExperimentRequest {
  seeds?: number[]
  replications?: number
  horizon_minutes?: number
  warmup_minutes?: number
  policies?: string[]
  baseline_policy?: string
}

export interface ExperimentResponse {
  engine_version: string
  config_hash: string
  seeds: number[]
  replications_count: number
  is_low_sample_size: boolean
  horizon_minutes: number
  warmup_minutes: number
  baseline_policy: string
  policies: string[]
  headline: string
  acuity_breakdown: Record<string, AcuityTierComparison>
  summaries: Record<string, PolicySummary>
  paired_comparisons: Record<string, PairedComparison>
}

