import { CheckCircle2, AlertCircle, Calculator, ShieldCheck, Scale } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Metrics } from '../api/types'

export function ValidationPanel({ metrics }: { metrics: Metrics }) {
  const query = useQuery({
    queryKey: ['benchmarks'],
    queryFn: api.benchmarks,
    retry: false,
  })

  if (!query.data) return null
  const benchmark = query.data

  const erlangWait =
    benchmark.erlang_c.expected_wait === null
      ? 'Unstable load'
      : `${benchmark.erlang_c.expected_wait.toFixed(2)} min`

  const icuBlockPct = benchmark.erlang_b_icu * 100
  const icuBlock = `${icuBlockPct.toFixed(1)}%`
  const obsWait = `${metrics.average_wait_minutes.toFixed(1)} min`

  return (
    <section data-tour="policy-validation" className="sentinel-card flex flex-col gap-6">
      {/* Header with status badge */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Calculator size={16} className="text-slate-700" />
            <span className="eyebrow">Mathematical Validation Layer</span>
          </div>
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
            Analytical Queueing Benchmarks vs Empirical Runtime
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Theoretical Erlang-C delays and Erlang-B blocking probabilities provide closed-form bounds to evaluate empirical simulation realization.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 rounded-lg text-emerald-700">
          <CheckCircle2 size={14} className="text-emerald-600" />
          <span className="text-xs font-bold font-mono">CALIBRATED ANALYTICAL LAYER</span>
        </div>
      </div>

      {/* 3 Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Erlang-C Wait */}
        <div className="bg-slate-50/70 border border-slate-200/90 rounded-xl p-5 flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-data">
                Erlang-C Delay
              </span>
              <span className="status-pill black">M/M/c Model</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-data">
                {erlangWait}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-2 font-medium">
              Theoretical waiting delay in queue under stationary Poisson arrivals and exponential service.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span>Formula: Wq = C(c, a) / (cμ - λ)</span>
          </div>
        </div>

        {/* Card 2: Erlang-B ICU Loss */}
        <div className="bg-slate-50/70 border border-slate-200/90 rounded-xl p-5 flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-data">
                Erlang-B ICU Loss
              </span>
              <span className={`status-pill ${icuBlockPct > 5 ? 'amber' : 'green'}`}>
                {icuBlockPct > 5 ? 'Elevated Risk' : 'Safe Capacity'}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-data">
                {icuBlock}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-2 font-medium">
              Theoretical probability that all critical ICU beds are occupied upon a new admission arrival.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span>Loss Model: M/M/c/c</span>
            <span className={icuBlockPct <= 5 ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
              {icuBlockPct <= 5 ? '✓ Under 5% SLA' : '⚠ Exceeds 5% SLA'}
            </span>
          </div>
        </div>

        {/* Card 3: Observed Simulation Wait */}
        <div className="bg-slate-50/70 border border-slate-200/90 rounded-xl p-5 flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-data">
                Observed Wait
              </span>
              <span className="status-pill green">Empirical</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-data">
                {obsWait}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-2 font-medium">
              Realized mean waiting time measured dynamically across completed patient episodes.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-mono">
            {metrics.patients_completed > 0 ? (
              <span className="text-emerald-600 font-bold flex items-center gap-1.5">
                <CheckCircle2 size={13} /> {metrics.patients_completed} Discharged Episodes
              </span>
            ) : (
              <span className="text-slate-400 font-medium flex items-center gap-1.5">
                <AlertCircle size={13} /> Awaiting discharges
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Mathematical Separation of Concerns Banner */}
      <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 flex items-start gap-3">
        <Scale size={18} className="text-slate-700 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 leading-relaxed">
          <strong className="text-slate-900 font-bold">Separation of Concerns:</strong> Theoretical Erlang models serve as steady-state analytical reference baselines assuming stationary Poisson arrivals. The discrete-event simulation accounts for dynamic non-stationary surges, multi-stage patient acuity escalation, resource degradation shocks, and state-dependent dynamic programming triage.
        </div>
      </div>
    </section>
  )
}
