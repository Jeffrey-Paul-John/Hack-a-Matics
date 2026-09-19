import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertCircle, BarChart2, CheckCircle2, Play, RefreshCw, Zap } from 'lucide-react'
import type { ComparisonResult } from '../api/types'

export interface StrategyComparisonProps {
  result: ComparisonResult | null
  isLoading?: boolean
  error?: string | null
  onRun?: () => void
}

export function StrategyComparison({
  result,
  isLoading = false,
  error = null,
  onRun,
}: StrategyComparisonProps) {
  // 1. Loading State with active clinical animation
  if (isLoading) {
    return (
      <section className="sentinel-card flex flex-col items-center justify-center p-10 text-center bg-slate-50/60 border border-slate-200">
        <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center mb-4 shadow-sm animate-pulse">
          <RefreshCw size={22} className="animate-spin text-emerald-400" />
        </div>
        <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
          Executing Monte Carlo Evaluation…
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-lg leading-relaxed">
          Simulating 120 full hospital operational shifts (30 independent replications across Urgency-Only, Wait-Aware, Resource-Aware, and MDP-Optimal policies).
        </p>

        {/* Animated Progress Track */}
        <div className="w-full max-w-md mt-6">
          <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-slate-900 rounded-full animate-[pulse_1.5s_ease-in-out_infinite]" style={{ width: '85%' }} />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-2">
            <span>DISCRETE EVENT ENGINE</span>
            <span>N = 30 RUNS · 95% CI</span>
          </div>
        </div>
      </section>
    )
  }

  // 2. Error State
  if (error) {
    return (
      <section className="sentinel-card p-6 border-red-200 bg-red-50/40 text-center flex flex-col items-center">
        <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-3">
          <AlertCircle size={20} />
        </div>
        <h3 className="text-sm font-bold text-red-900">
          Monte Carlo Evaluation Interrupted
        </h3>
        <p className="text-xs text-red-700 mt-1 max-w-md">
          {error}
        </p>
        {onRun && (
          <button onClick={onRun} className="btn-secondary mt-4 text-xs font-bold">
            <RefreshCw size={13} />
            <span>Retry Evaluation</span>
          </button>
        )}
      </section>
    )
  }

  // 3. Ready / Empty State
  if (!result) {
    return (
      <section className="sentinel-card p-10 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-800 mb-4">
          <BarChart2 size={24} className="text-slate-800" />
        </div>
        <span className="eyebrow">Stochastic Simulation Suite</span>
        <h3 className="text-base font-extrabold text-slate-900 tracking-tight mt-1">
          Monte Carlo 30-Replication Evaluation Ready
        </h3>
        <p className="text-xs text-slate-500 mt-2 max-w-lg leading-relaxed">
          Execute parallel simulation runs across multiple pseudorandom seeds to benchmark clinical wait times, resource utilization, and SLA violations with Student's <em>t</em> 95% Confidence Intervals.
        </p>

        {onRun && (
          <button
            onClick={onRun}
            className="btn-primary mt-6 py-2.5 px-5 text-xs shadow-md hover:shadow-lg transition-all"
          >
            <Play size={14} className="fill-white" />
            <span>Start 30-Replication Evaluation</span>
          </button>
        )}
      </section>
    )
  }

  // 4. Populated Benchmark Results
  const chartData = Object.entries(result).map(([strategy, value]) => {
    const mean = Number(value.average_wait_minutes.mean.toFixed(2))
    const ciUpper = value.average_wait_minutes.ci95[1]
    const range = Number(Math.max(0, ciUpper - mean).toFixed(2))
    return {
      strategy: strategy.replace('_', ' '),
      mean,
      range,
    }
  })

  return (
    <section className="sentinel-card flex flex-col gap-5">
      {/* Header with Re-run button */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 size={16} className="text-slate-700" />
            <span className="eyebrow">Monte Carlo Evaluation</span>
          </div>
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
            Policy Comparison (30 Replications, 95% CI)
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="data-label bg-slate-900 text-white font-mono text-[10px] font-bold">
            N = 30 REPLICATIONS
          </span>
          {onRun && (
            <button
              onClick={onRun}
              className="btn-secondary py-1.5 px-3 text-xs"
              title="Re-run Monte Carlo simulation"
            >
              <RefreshCw size={12} />
              <span>Re-run</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-1">
        {/* Error Bar Chart */}
        <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-900 mb-3 font-data uppercase tracking-wider flex items-center justify-between">
            <span>Average Wait Time (Minutes)</span>
            <span className="text-[10px] text-slate-400 font-normal">· 95% Confidence Interval</span>
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 15, right: 15, left: -15, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="strategy"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  angle={-10}
                  textAnchor="end"
                />
                <YAxis unit="m" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  formatter={(val: number) => [`${val} min`, 'Mean Wait']}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '12px',
                  }}
                  itemStyle={{ color: '#ffffff' }}
                />
                <Bar dataKey="mean" fill="#0f172a" radius={[4, 4, 0, 0]}>
                  <ErrorBar dataKey="range" width={6} strokeWidth={2} stroke="#ef4444" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Statistical Summary Table */}
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="sentinel-table">
            <thead className="bg-slate-50">
              <tr>
                <th>Policy Strategy</th>
                <th>Mean Wait (95% CI)</th>
                <th>Bed / Staff Util</th>
                <th className="text-right">Mean SLA Violations</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result).map(([strategyKey, comp]) => {
                const waitMean = comp.average_wait_minutes.mean.toFixed(1)
                const waitCI = `[${comp.average_wait_minutes.ci95[0].toFixed(1)}, ${comp.average_wait_minutes.ci95[1].toFixed(1)}]`
                const utilMean = `${comp.utilization_percent.mean.toFixed(1)}%`
                const slaMean = comp.sla_violations.mean.toFixed(1)

                return (
                  <tr key={strategyKey}>
                    <td className="font-bold text-slate-900 capitalize py-3">
                      {strategyKey.replace('_', ' ')}
                    </td>
                    <td className="font-mono">
                      <strong className="text-slate-900">{waitMean}m</strong>{' '}
                      <span className="text-slate-400 text-[10px]">{waitCI}</span>
                    </td>
                    <td className="font-mono font-semibold text-slate-700">{utilMean}</td>
                    <td className="text-right font-mono font-bold text-slate-900">{slaMean}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
