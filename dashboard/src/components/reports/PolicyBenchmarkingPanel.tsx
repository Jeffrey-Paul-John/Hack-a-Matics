import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ErrorBar,
} from 'recharts'
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Fingerprint,
  Info,
  Layers,
  Play,
  RefreshCw,
  Scale,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { api } from '../../api/client'
import type { ExperimentResponse } from '../../api/types'

const ALL_POLICIES = [
  { id: 'fifo', label: 'First-In, First-Out (FIFO)', desc: 'Pure arrival-order baseline' },
  { id: 'random', label: 'Random Allocation', desc: 'Deterministic pseudo-random control' },
  { id: 'static_priority', label: 'Static Priority', desc: 'Acuity-only triage ranking' },
  { id: 'wait_aware', label: 'Wait-Aware Dynamic', desc: 'Acuity + delay escalation' },
  { id: 'mdp_optimal', label: 'MDP Value Optimal', desc: 'Dynamic programming optimization' },
]

export function PolicyBenchmarkingPanel() {
  const [replications, setReplications] = useState(30)
  const [horizonMinutes, setHorizonMinutes] = useState(480)
  const [warmupMinutes, setWarmupMinutes] = useState(60)
  const [baselinePolicy, setBaselinePolicy] = useState('fifo')
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([
    'fifo',
    'random',
    'static_priority',
    'wait_aware',
    'mdp_optimal',
  ])

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [experimentData, setExperimentData] = useState<ExperimentResponse | null>(null)

  const togglePolicy = (policyId: string) => {
    if (selectedPolicies.includes(policyId)) {
      if (selectedPolicies.length > 2) {
        setSelectedPolicies(selectedPolicies.filter((p) => p !== policyId))
      }
    } else {
      setSelectedPolicies([...selectedPolicies, policyId])
    }
  }

  const handleRun = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const resp = await api.benchmarkExperiment({
        replications,
        horizon_minutes: horizonMinutes,
        warmup_minutes: warmupMinutes,
        policies: selectedPolicies,
        baseline_policy: baselinePolicy,
      })
      setExperimentData(resp)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute benchmark experiment')
    } finally {
      setIsLoading(false)
    }
  }

  // Format chart data
  const chartData = experimentData
    ? experimentData.policies.map((p) => {
        const s = experimentData.summaries[p]
        const m = s?.mean_wait_minutes?.mean ?? 0
        const ci_upper = s?.mean_wait_minutes?.ci_upper ?? m
        return {
          name: p.replace('_', ' ').toUpperCase(),
          policy: p,
          meanWait: m,
          errorRange: [m, ci_upper - m],
          p90Wait: s?.p90_wait_minutes?.mean ?? 0,
        }
      })
    : []

  return (
    <section className="sentinel-card flex flex-col gap-6">
      {/* 1. Header & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Scale size={16} className="text-slate-700" />
            <span className="eyebrow">Rigorous Policy Benchmarking (Phase 1)</span>
          </div>
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
            Common Random Numbers (CRN) Policy Efficacy Evaluation
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Compares scheduling policies on identical arrival streams and pre-assigned patient variates.
            Excludes warm-up by arrival time, accounts for right-censored wait durations, and reports Holm-Bonferroni adjusted paired statistics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {replications < 20 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold rounded-lg">
              <AlertTriangle size={13} className="text-amber-600" />
              <span>Low Sample Size (&lt; 20)</span>
            </div>
          )}
          <button
            onClick={handleRun}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
          >
            {isLoading ? (
              <>
                <RefreshCw size={14} className="animate-spin text-emerald-400" />
                <span>Running CRN Replications…</span>
              </>
            ) : (
              <>
                <Play size={14} className="fill-current text-emerald-400" />
                <span>Run Multi-Seed Benchmark</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Configuration Drawer / Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 text-xs">
        {/* Replications */}
        <div>
          <label className="font-bold text-slate-700 block mb-1">
            Replications (N = {replications})
          </label>
          <input
            type="range"
            min="5"
            max="50"
            step="5"
            value={replications}
            onChange={(e) => setReplications(Number(e.target.value))}
            className="w-full accent-slate-900 cursor-pointer"
          />
          <span className="text-[10px] text-slate-400">Default 30 replications</span>
        </div>

        {/* Horizon */}
        <div>
          <label className="font-bold text-slate-700 block mb-1">
            Shift Horizon: {horizonMinutes} min ({Math.round(horizonMinutes / 60)}h)
          </label>
          <input
            type="range"
            min="120"
            max="720"
            step="60"
            value={horizonMinutes}
            onChange={(e) => setHorizonMinutes(Number(e.target.value))}
            className="w-full accent-slate-900 cursor-pointer"
          />
          <span className="text-[10px] text-slate-400">Full operational duration</span>
        </div>

        {/* Warmup */}
        <div>
          <label className="font-bold text-slate-700 block mb-1">
            Warm-up Cutoff: {warmupMinutes} min
          </label>
          <input
            type="range"
            min="0"
            max="120"
            step="15"
            value={warmupMinutes}
            onChange={(e) => setWarmupMinutes(Number(e.target.value))}
            className="w-full accent-slate-900 cursor-pointer"
          />
          <span className="text-[10px] text-slate-400">Discarded by arrival time</span>
        </div>

        {/* Baseline Selector */}
        <div>
          <label className="font-bold text-slate-700 block mb-1">Named Baseline Policy</label>
          <select
            value={baselinePolicy}
            onChange={(e) => setBaselinePolicy(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
          >
            {ALL_POLICIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-slate-400">Default comparator: FIFO</span>
        </div>
      </div>

      {/* Policy Selection Checkboxes */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-slate-600 mr-2">Compared Policies:</span>
        {ALL_POLICIES.map((p) => {
          const checked = selectedPolicies.includes(p.id)
          const isBase = p.id === baselinePolicy
          return (
            <button
              key={p.id}
              onClick={() => togglePolicy(p.id)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-colors ${
                checked
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              <span>{p.label}</span>
              {isBase && (
                <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 text-[9px] font-bold rounded uppercase">
                  Base
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-3">
          <AlertCircle size={16} className="text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 3. Results Section */}
      {experimentData && (
        <div className="flex flex-col gap-6 mt-2">
          {/* Provenance Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white p-4 rounded-xl shadow-sm">
            <div className="flex items-center gap-3">
              <Fingerprint size={20} className="text-emerald-400 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tracking-wide uppercase font-mono text-emerald-400">
                    Audit Verification Provenance
                  </span>
                  <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-mono">
                    v{experimentData.engine_version}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate max-w-md">
                  Config Hash: {experimentData.config_hash}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono text-slate-300">
              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase">Seeds (CRN Aligned)</div>
                <div className="font-bold text-white">N = {experimentData.replications_count}</div>
              </div>
              <div className="w-px h-8 bg-slate-800" />
              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase">Warmup / Horizon</div>
                <div className="font-bold text-white">
                  {experimentData.warmup_minutes}m / {experimentData.horizon_minutes}m
                </div>
              </div>
            </div>
          </div>

          {/* Plain-Language Data-Driven Headline */}
          <div className="p-4 bg-emerald-50/70 border border-emerald-200/90 rounded-xl flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <Award size={18} />
            </div>
            <div>
              <span className="eyebrow text-emerald-800">Clinical Headline Summary</span>
              <h3 className="text-sm font-extrabold text-emerald-950 mt-0.5">
                {experimentData.headline}
              </h3>
              <p className="text-xs text-emerald-800/80 mt-1">
                Paired across {experimentData.replications_count} replications under identical arrival streams with right-censoring for patients active at shift conclusion.
              </p>
            </div>
          </div>

          {/* Acuity Winner/Loser Breakdown */}
          <div>
            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-3">
              Acuity Tier Performance Breakdown (Best Policy vs {experimentData.baseline_policy.toUpperCase()})
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(experimentData.acuity_breakdown).map(([acuity, data]) => {
                const isImproved = data.status === 'improved'
                const isWorsened = data.status === 'worsened'
                return (
                  <div
                    key={acuity}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                      isImproved
                        ? 'bg-emerald-50/40 border-emerald-200 text-emerald-950'
                        : isWorsened
                        ? 'bg-amber-50/40 border-amber-200 text-amber-950'
                        : 'bg-slate-50/60 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-extrabold tracking-wider">{acuity}</span>
                      {isImproved && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                          <TrendingDown size={12} /> {Math.abs(data.pct_change)}%
                        </span>
                      )}
                      {isWorsened && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded">
                          <TrendingUp size={12} /> +{data.pct_change}%
                        </span>
                      )}
                      {data.status === 'neutral' && (
                        <span className="text-[10px] font-bold text-slate-500">Parity</span>
                      )}
                    </div>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-xl font-extrabold font-data">
                        {data.policy_mean !== null ? `${data.policy_mean}m` : 'N/A'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-data">
                        Base: {data.baseline_mean !== null ? `${data.baseline_mean}m` : 'N/A'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Main Benchmark Comparison Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  <th className="py-3 px-4">Policy</th>
                  <th className="py-3 px-3">Mean Wait (95% CI)</th>
                  <th className="py-3 px-3">P90 Wait</th>
                  <th className="py-3 px-3">Wait: Critical</th>
                  <th className="py-3 px-3">Wait: High</th>
                  <th className="py-3 px-3">Wait: Low</th>
                  <th className="py-3 px-3">ICU Blocking</th>
                  <th className="py-3 px-3">4-Hr Target</th>
                  <th className="py-3 px-3">Throughput</th>
                  <th className="py-3 px-3">Censored</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white font-data">
                {experimentData.policies.map((p) => {
                  const s = experimentData.summaries[p]
                  const isBase = p === experimentData.baseline_policy
                  return (
                    <tr key={p} className={isBase ? 'bg-slate-50/50 font-semibold' : 'hover:bg-slate-50/80'}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-sans font-bold text-slate-900">
                            {p.replace('_', ' ').toUpperCase()}
                          </span>
                          {isBase && (
                            <span className="bg-slate-200 text-slate-700 text-[9px] font-bold px-1.5 py-0.5 rounded font-mono">
                              BASELINE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-slate-900">{s.mean_wait_minutes.mean} min</span>
                        <span className="text-[10px] text-slate-400 block">
                          [{s.mean_wait_minutes.ci_lower}, {s.mean_wait_minutes.ci_upper}]
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-800">{s.p90_wait_minutes.mean} min</td>
                      <td className="py-3 px-3 font-semibold text-rose-700">
                        {s.wait_by_acuity.CRITICAL?.mean !== null
                          ? `${s.wait_by_acuity.CRITICAL.mean}m`
                          : '—'}
                      </td>
                      <td className="py-3 px-3 text-amber-700">
                        {s.wait_by_acuity.HIGH?.mean !== null
                          ? `${s.wait_by_acuity.HIGH.mean}m`
                          : '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {s.wait_by_acuity.LOW?.mean !== null
                          ? `${s.wait_by_acuity.LOW.mean}m`
                          : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-semibold ${
                            s.icu_blocking_probability.mean > 0.1 ? 'text-amber-700' : 'text-slate-700'
                          }`}
                        >
                          {(s.icu_blocking_probability.mean * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-emerald-700">
                        {s.target_4hr_met_percent.mean}%
                      </td>
                      <td className="py-3 px-3 text-slate-800">
                        {s.throughput_per_hour.mean} / hr
                      </td>
                      <td className="py-3 px-3 text-slate-500 font-mono">
                        {s.censored_count_mean}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paired Statistical Inference Table */}
          <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="eyebrow">Paired Hypothesis Testing</span>
                <h4 className="text-xs font-extrabold text-slate-900 tracking-tight">
                  Paired Difference Tests vs {experimentData.baseline_policy.toUpperCase()} (N = {experimentData.replications_count})
                </h4>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                Method: 2,000 Resample Bootstrap CI · Holm-Bonferroni Family-Wise Adjustment
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                    <th className="py-2.5 px-3">Treatment Policy</th>
                    <th className="py-2.5 px-3">Mean Difference (Δ)</th>
                    <th className="py-2.5 px-3">Cohen's d</th>
                    <th className="py-2.5 px-3">Bootstrap 95% CI</th>
                    <th className="py-2.5 px-3">Raw p-value</th>
                    <th className="py-2.5 px-3">Holm-adjusted p</th>
                    <th className="py-2.5 px-3">Significance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-data">
                  {Object.entries(experimentData.paired_comparisons).map(([policy, stat]) => {
                    const isSig = stat.is_significant
                    return (
                      <tr key={policy} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-sans font-bold text-slate-900">
                          {policy.replace('_', ' ').toUpperCase()}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          {stat.mean_diff > 0 ? `+${stat.mean_diff}` : stat.mean_diff} min
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{stat.cohens_d}</td>
                        <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                          [{stat.bootstrap_ci.ci_lower}, {stat.bootstrap_ci.ci_upper}]
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                          {stat.p_value_raw < 0.0001 ? '< 0.0001' : stat.p_value_raw}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-[11px] text-slate-900">
                          {stat.p_value_holm < 0.0001 ? '< 0.0001' : stat.p_value_holm}
                        </td>
                        <td className="py-2.5 px-3">
                          {isSig ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              <CheckCircle2 size={11} />
                              Sig (p &lt; 0.05)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
                              Not Sig
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Grouped Bar Chart Visualizer */}
          <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="eyebrow">Visual Policy Distribution</span>
                <h4 className="text-xs font-extrabold text-slate-900">
                  Mean Waiting Time & 95% Confidence Intervals Across Policies
                </h4>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-slate-900" />
                  <span>Mean Wait (min)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-slate-400" />
                  <span>P90 Wait (min)</span>
                </div>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    unit="m"
                    domain={[0, 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="meanWait" fill="#0f172a" radius={[6, 6, 0, 0]}>
                    <ErrorBar dataKey="errorRange" width={4} strokeWidth={2} stroke="#10b981" />
                  </Bar>
                  <Bar dataKey="p90Wait" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
