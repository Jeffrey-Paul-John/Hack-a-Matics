import { useState } from 'react'
import {
  X,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
  Minus,
  RefreshCw,
} from 'lucide-react'
import { api } from '../api/client'
import type { Strategy, WhatIfResponse } from '../api/types'
import { useSimulationStore } from '../store/simulationStore'

interface WhatIfModalProps {
  isOpen: boolean
  onClose: () => void
  currentStrategy?: Strategy
}

interface PresetOption {
  label: string
  desc: string
  adjustments: Record<string, Record<string, number>>
  strategy_override?: Strategy | null
}

const PRESETS: PresetOption[] = [
  {
    label: '+2 Nurses (Emergency)',
    desc: 'Rapid surge coverage for ER triage & stabilization',
    adjustments: { emergency: { nurses: 2 } },
  },
  {
    label: '+1 ICU Bed',
    desc: 'Relieve critical intensive care boarding bottleneck',
    adjustments: { intensive_care: { beds: 1 } },
  },
  {
    label: '+2 Beds & +1 Nurse (General)',
    desc: 'Expedite ward transfers and lower queue buildup',
    adjustments: { general_ward: { beds: 2, nurses: 1 } },
  },
  {
    label: '+1 Doctor & +2 Nurses (Surgery)',
    desc: 'Unblock surgical post-op throughput',
    adjustments: { surgery: { doctors: 1, nurses: 2 } },
  },
]

export function WhatIfModal({ isOpen, onClose, currentStrategy = 'resource_aware' }: WhatIfModalProps) {
  const [horizonMinutes, setHorizonMinutes] = useState<number>(60)
  const [selectedDept, setSelectedDept] = useState<string>('emergency')
  const [selectedRes, setSelectedRes] = useState<string>('nurses')
  const [qty, setQty] = useState<number>(2)
  const [strategyOverride, setStrategyOverride] = useState<Strategy | ''>('')
  const [customAdjustments, setCustomAdjustments] = useState<Record<string, Record<string, number>>>({
    emergency: { nurses: 2 },
  })

  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<WhatIfResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const notify = useSimulationStore(s => s.notify)

  if (!isOpen) return null

  const handleApplyPreset = (preset: PresetOption) => {
    setCustomAdjustments(preset.adjustments)
    if (preset.strategy_override) {
      setStrategyOverride(preset.strategy_override)
    }
  }

  const handleAddAdjustment = () => {
    setCustomAdjustments(prev => {
      const next = { ...prev }
      if (!next[selectedDept]) next[selectedDept] = {}
      next[selectedDept] = {
        ...next[selectedDept],
        [selectedRes]: (next[selectedDept][selectedRes] || 0) + qty,
      }
      return next
    })
  }

  const handleRemoveAdjustment = (dept: string, res: string) => {
    setCustomAdjustments(prev => {
      const next = { ...prev }
      if (next[dept]) {
        const deptAdj = { ...next[dept] }
        delete deptAdj[res]
        if (Object.keys(deptAdj).length === 0) {
          delete next[dept]
        } else {
          next[dept] = deptAdj
        }
      }
      return next
    })
  }

  const handleRunSimulation = async () => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await api.whatIf({
        adjustments: customAdjustments,
        horizon_minutes: horizonMinutes,
        strategy_override: strategyOverride ? (strategyOverride as Strategy) : null,
      })
      setResult(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Simulation failed'
      setError(msg)
      notify(`What-if simulation failed: ${msg}`, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const totalAddedStaff = Object.values(customAdjustments).reduce(
    (acc, pool) => acc + Object.values(pool).reduce((a, b) => a + b, 0),
    0
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden text-slate-800">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 to-indigo-950 text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">"What If?" Counterfactual Sandbox</h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  Forked State Engine
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Test staffing & bed adjustments against the exact same patient queues without disrupting live operations.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Presets Row */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2 font-mono">
              Quick Scenarios
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => handleApplyPreset(preset)}
                  className="text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all cursor-pointer group"
                >
                  <span className="font-bold text-slate-900 block group-hover:text-indigo-600 transition-colors">
                    {preset.label}
                  </span>
                  <span className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                    {preset.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Configurator Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] font-mono">
                Simulation Parameters
              </span>
              <span className="text-[11px] text-slate-500">
                Current Strategy: <span className="font-bold capitalize">{currentStrategy.replace('_', ' ')}</span>
              </span>
            </div>

            {/* Department + Resource + Quantity Picker */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                  Department
                </label>
                <select
                  value={selectedDept}
                  onChange={e => setSelectedDept(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-400 cursor-pointer capitalize"
                >
                  <option value="emergency">Emergency (ER)</option>
                  <option value="intensive_care">Intensive Care (ICU)</option>
                  <option value="general_ward">General Ward</option>
                  <option value="surgery">Surgery</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                  Resource Type
                </label>
                <select
                  value={selectedRes}
                  onChange={e => setSelectedRes(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-400 cursor-pointer capitalize"
                >
                  <option value="nurses">Nurses</option>
                  <option value="beds">Beds</option>
                  <option value="doctors">Doctors</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                  Quantity
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-10 text-center font-bold text-sm text-slate-900">+{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty(q => Math.min(10, q + 1))}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleAddAdjustment}
                  className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Add Delta</span>
                </button>
              </div>
            </div>

            {/* Active Adjustments Badges */}
            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">
                Staged Adjustments ({totalAddedStaff} resource delta total):
              </span>
              {Object.keys(customAdjustments).length === 0 ? (
                <span className="text-[11px] text-slate-400 italic">
                  No adjustments staged. Add some above or pick a quick scenario.
                </span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(customAdjustments).flatMap(([dept, pools]) =>
                    Object.entries(pools).map(([res, count]) => (
                      <span
                        key={`${dept}-${res}`}
                        className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-800 px-2.5 py-1 rounded-full text-xs font-semibold"
                      >
                        <span className="capitalize">{dept.replace('_', ' ')}:</span>
                        <strong className="text-indigo-950">+{count} {res}</strong>
                        <button
                          type="button"
                          onClick={() => handleRemoveAdjustment(dept, res)}
                          className="hover:text-red-600 cursor-pointer ml-1"
                          title="Remove adjustment"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Horizon & Strategy Override */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                  Simulation Horizon
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[30, 60, 120].map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHorizonMinutes(h)}
                      className={`py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                        horizonMinutes === h
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {h} mins
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                  Strategy Override (Optional)
                </label>
                <select
                  value={strategyOverride}
                  onChange={e => setStrategyOverride(e.target.value as Strategy | '')}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer capitalize"
                >
                  <option value="">Keep Live Strategy ({currentStrategy.replace('_', ' ')})</option>
                  <option value="resource_aware">Resource Aware</option>
                  <option value="wait_aware">Wait Aware</option>
                  <option value="urgency_only">Urgency Only</option>
                  <option value="mdp_optimal">MDP Optimal</option>
                </select>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Results Comparison View */}
          {result && (
            <div className="space-y-4 animate-fadeIn">
              {/* Executive Summary Recommendation Card */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-emerald-900">
                    {result.delta.wait_minutes < 0
                      ? `✨ Wait Times Reduced by ${Math.abs(result.delta.wait_change_percent).toFixed(1)}%`
                      : result.delta.wait_minutes === 0
                      ? 'No Change in Wait Times'
                      : 'Wait Times Slightly Elevated'}
                  </h4>
                  <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                    Forked hospital simulation over a <strong className="font-bold">{result.horizon_minutes}-minute horizon</strong> demonstrates that adding staged capacity{' '}
                    {result.delta.wait_minutes < 0 ? (
                      <>
                        cuts average patient waiting time by{' '}
                        <strong>{Math.abs(result.delta.wait_minutes).toFixed(1)} minutes</strong>
                      </>
                    ) : (
                      'maintains existing queue equilibrium'
                    )}
                    {result.delta.sla_violations < 0 && (
                      <>
                        {' '}and prevents <strong className="text-emerald-950">{Math.abs(result.delta.sla_violations)} critical SLA breach(es)</strong>
                      </>
                    )}
                    .
                  </p>
                </div>
              </div>

              {/* Side by Side Comparative Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Metric 1: Average Wait Time */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider font-mono">Avg Wait Time</span>
                    <Clock size={15} />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-lg font-black text-slate-900">
                        {result.counterfactual.average_wait_minutes.toFixed(1)}m
                      </div>
                      <div className="text-[10px] text-slate-400 line-through">
                        Baseline: {result.baseline.average_wait_minutes.toFixed(1)}m
                      </div>
                    </div>
                    <div
                      className={`flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-full ${
                        result.delta.wait_minutes <= 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {result.delta.wait_minutes <= 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                      <span>{result.delta.wait_minutes <= 0 ? '' : '+'}{result.delta.wait_minutes.toFixed(1)}m</span>
                    </div>
                  </div>
                </div>

                {/* Metric 2: SLA Violations */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider font-mono">SLA Breaches</span>
                    <ShieldCheck size={15} />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-lg font-black text-slate-900">
                        {result.counterfactual.sla_violations}
                      </div>
                      <div className="text-[10px] text-slate-400 line-through">
                        Baseline: {result.baseline.sla_violations}
                      </div>
                    </div>
                    <div
                      className={`flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-full ${
                        result.delta.sla_violations <= 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {result.delta.sla_violations <= 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                      <span>
                        {result.delta.sla_violations <= 0 ? '' : '+'}
                        {result.delta.sla_violations}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metric 3: Throughput / Discharges */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider font-mono">Discharges</span>
                    <ArrowRight size={15} />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-lg font-black text-slate-900">
                        {result.counterfactual.patients_completed}
                      </div>
                      <div className="text-[10px] text-slate-400 line-through">
                        Baseline: {result.baseline.patients_completed}
                      </div>
                    </div>
                    <div
                      className={`flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-full ${
                        result.delta.patients_completed >= 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      <span>
                        {result.delta.patients_completed >= 0 ? '+' : ''}
                        {result.delta.patients_completed}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            Dismiss
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRunSimulation}
              disabled={isLoading || Object.keys(customAdjustments).length === 0}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Cloning State & Simulating...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>Run Counterfactual Comparison</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
