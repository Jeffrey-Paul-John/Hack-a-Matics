import { useEffect, useState } from 'react'
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
  Lightbulb,
  Users,
  Activity,
  Timer,
  Info,
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
    label: '+2 Nurses (ER)',
    desc: 'Rapid surge coverage for ER triage & stabilization',
    adjustments: { ER: { NURSE: 2 } },
  },
  {
    label: '+2 Doctors (ER)',
    desc: 'Relieve primary emergency doctor consultation bottleneck',
    adjustments: { ER: { DOCTOR: 2 } },
  },
  {
    label: '+2 Doctors (General Ward)',
    desc: 'Unblock inpatient admissions & relieve holding queues',
    adjustments: { GENERAL: { DOCTOR: 2 } },
  },
  {
    label: '+2 Beds (ICU)',
    desc: 'Expand critical intensive care capacity for severe transfers',
    adjustments: { ICU: { BED: 2 } },
  },
]

export function WhatIfModal({ isOpen, onClose, currentStrategy = 'resource_aware' }: WhatIfModalProps) {
  const [horizonMinutes, setHorizonMinutes] = useState<number>(60)
  const [replications, setReplications] = useState<number>(20)
  const [selectedDept, setSelectedDept] = useState<string>('ER')
  const [selectedRes, setSelectedRes] = useState<string>('NURSE')
  const [qty, setQty] = useState<number>(2)
  const [strategyOverride, setStrategyOverride] = useState<Strategy | ''>('')
  const [customAdjustments, setCustomAdjustments] = useState<Record<string, Record<string, number>>>({
    ER: { NURSE: 2 },
  })

  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<WhatIfResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const notify = useSimulationStore(s => s.notify)
  const liveState = useSimulationStore(s => s.state)

  // Register Escape shortcut with cleanup; active only when modal is open
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Live state computations for fork context
  const liveQueues = liveState?.queues
  const liveResources = liveState?.resources

  const liveQueueTotal = liveQueues
    ? Object.values(liveQueues).reduce((acc, q) => acc + (q?.length || 0), 0)
    : 0

  const departmentQueues: Record<string, number> = liveQueues
    ? Object.fromEntries(Object.entries(liveQueues).map(([d, q]) => [d, q?.length || 0]))
    : {}

  // Find current bottleneck from live state (highest utilization)
  const liveBottleneck = (() => {
    if (!liveResources) return null
    let maxUtil = -1
    let bn: {
      department: string
      resource: string
      label: string
      utilization: number
      available: number
      total: number
    } | null = null

    for (const [dept, pools] of Object.entries(liveResources)) {
      for (const [res, pool] of Object.entries(pools)) {
        if (pool && pool.total > 0) {
          const util = pool.occupied / pool.total
          if (util > maxUtil) {
            maxUtil = util
            const resLabel = res.charAt(0) + res.slice(1).toLowerCase()
            bn = {
              department: dept,
              resource: res,
              label: `${dept} ${resLabel}`,
              utilization: util,
              available: pool.available ?? (pool.total - pool.occupied),
              total: pool.total,
            }
          }
        }
      }
    }
    return bn
  })()

  // Active fork context (prefer fork_context from simulation result, fallback to live)
  const activeForkContext = result?.fork_context
  const displayedWaiting = activeForkContext ? activeForkContext.total_waiting : liveQueueTotal
  const displayedDeptQueues = activeForkContext ? activeForkContext.department_queues : departmentQueues
  // Bottleneck = "none" when total_waiting == 0
  const activeBottleneck = displayedWaiting === 0 ? null : (activeForkContext?.bottleneck ?? liveBottleneck)

  // Surgery resource demand warning
  const isSurgerySelected = selectedDept.toUpperCase() === 'SURGERY'
  const isSurgeryStaged = Object.keys(customAdjustments).some(
    d => d.toUpperCase() === 'SURGERY' && Object.values(customAdjustments[d] || {}).some(v => v > 0)
  )
  const showSurgeryWarning = isSurgerySelected || isSurgeryStaged

  // Smarter scenarios: Suggest bottleneck scenario
  const handleSuggestBottleneckScenario = () => {
    if (displayedWaiting === 0 || !activeBottleneck) {
      notify('No active bottleneck detected - hospital has an empty queue or is well below capacity.', 'info')
      return
    }
    const deptKey = activeBottleneck.department
    const resKey = activeBottleneck.resource
    setCustomAdjustments({
      [deptKey]: { [resKey]: 2 },
    })
    setSelectedDept(deptKey)
    setSelectedRes(resKey)
    setQty(2)
    notify(`Suggested scenario: +2 ${activeBottleneck.label} (currently ${(activeBottleneck.utilization * 100).toFixed(0)}% utilized)`, 'success')
  }

  // Detect if staged delta is for a non-bottleneck resource
  const isNonBottleneckStaged = (() => {
    if (displayedWaiting === 0 || !activeBottleneck || Object.keys(customAdjustments).length === 0) return false
    // If only surgery is staged, the surgery-specific warning takes precedence
    if (isSurgeryStaged && Object.keys(customAdjustments).length === 1) return false
    // Only warn if the bottleneck is actually under significant load (>60%)
    if (activeBottleneck.utilization < 0.6) return false

    const bnDept = activeBottleneck.department.toUpperCase()
    const bnRes = activeBottleneck.resource.toUpperCase()

    for (const [dept, pools] of Object.entries(customAdjustments)) {
      const dUpper = dept.toUpperCase()
      for (const [res, count] of Object.entries(pools)) {
        if (count > 0) {
          const rUpper = res.toUpperCase()
          const deptMatch =
            dUpper === bnDept ||
            (dUpper === 'EMERGENCY' && bnDept === 'ER') ||
            (dUpper === 'GENERAL_WARD' && bnDept === 'GENERAL') ||
            (dUpper === 'INTENSIVE_CARE' && bnDept === 'ICU')
          const resMatch = rUpper.startsWith(bnRes.substring(0, 3)) || bnRes.startsWith(rUpper.substring(0, 3))
          if (deptMatch && resMatch) return false
        }
      }
    }
    return true
  })()

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
        resource_adjustments: customAdjustments,
        horizon_minutes: horizonMinutes,
        strategy_override: strategyOverride ? (strategyOverride as Strategy) : null,
        replications,
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

        {/* Live Queue & Fork Context Strip */}
        <div className="bg-slate-100/90 border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 px-2.5 py-1 rounded-full shadow-2xs">
              <span
                className={`w-2 h-2 rounded-full ${displayedWaiting > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}
              />
              <span className="font-bold text-slate-900">
                Live queue: {displayedWaiting} waiting
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-600 font-mono text-[11px]">
              <span>Queues:</span>
              {Object.entries(displayedDeptQueues).map(([dept, count]) => (
                <span key={dept} className="bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-700 font-semibold">
                  <strong>{dept}:</strong> {count}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Current Bottleneck:</span>
            {displayedWaiting === 0 || !activeBottleneck ? (
              <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold text-[11px]">
                None (0 waiting)
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-semibold text-[11px] flex items-center gap-1">
                <span>{activeBottleneck.label}</span>
                <span className="text-[10px] font-mono">({(activeBottleneck.utilization * 100).toFixed(0)}% util)</span>
              </span>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Quick Scenarios Row with Suggest Bottleneck Scenario Button */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block font-mono">
                Quick Scenarios
              </label>
              {activeBottleneck && (
                <button
                  type="button"
                  onClick={handleSuggestBottleneckScenario}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-bold text-[11px] transition-all cursor-pointer shadow-2xs"
                >
                  <Lightbulb size={13} className="text-amber-500" />
                  <span>Suggest scenario (+2 {activeBottleneck.label})</span>
                </button>
              )}
            </div>
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
                  <option value="ER">Emergency (ER)</option>
                  <option value="ICU">Intensive Care (ICU)</option>
                  <option value="GENERAL">General Ward</option>
                  <option value="SURGERY">Surgery</option>
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
                  <option value="NURSE">Nurses</option>
                  <option value="DOCTOR">Doctors</option>
                  <option value="BED">Beds</option>
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

            {/* Surgery Warning Banner */}
            {showSurgeryWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-start gap-2 animate-fadeIn">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">No Patients Use This Resource: </span>
                  <span>
                    Surgery has no patient demand in this simulation model, so adding capacity here will not affect wait times or throughput.
                  </span>
                </div>
              </div>
            )}

            {/* Non-bottleneck Warning Banner */}
            {isNonBottleneckStaged && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-start gap-2 animate-fadeIn">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Non-Bottleneck Resource Staged: </span>
                  <span>
                    You are adding capacity to resources other than the current primary bottleneck (
                    <strong>{activeBottleneck?.label}</strong> at{' '}
                    {((activeBottleneck?.utilization ?? 0) * 100).toFixed(0)}% utilization). This may result in no
                    measurable improvement in patient wait times.
                  </span>
                </div>
              </div>
            )}

            {/* Active Adjustments Badges */}
            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">
                Staged Adjustments ({totalAddedStaff} resource delta total):
              </span>
              {Object.keys(customAdjustments).length === 0 ? (
                <span className="text-[11px] text-slate-400 italic">
                  No adjustments staged. Add some above or click "Suggest scenario".
                </span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(customAdjustments).flatMap(([dept, pools]) =>
                    Object.entries(pools).map(([res, count]) => {
                      const depUpper = dept.toUpperCase()
                      const pluralRes = res.toLowerCase().endsWith('s')
                        ? res.charAt(0).toUpperCase() + res.slice(1).toLowerCase()
                        : res.charAt(0).toUpperCase() + res.slice(1).toLowerCase() + 's'
                      const basePool = liveResources?.[depUpper]?.[res.toUpperCase()]
                      const baseCount = basePool?.total ?? 0
                      const targetCount = baseCount + count
                      const chipLabel = `${depUpper} ${pluralRes}: ${baseCount} -> ${targetCount} (+${count})`

                      return (
                        <span
                          key={`${dept}-${res}`}
                          className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-800 px-2.5 py-1 rounded-full text-xs font-semibold"
                        >
                          <strong className="text-indigo-950 font-mono">{chipLabel}</strong>
                          <button
                            type="button"
                            onClick={() => handleRemoveAdjustment(dept, res)}
                            className="hover:text-red-600 cursor-pointer ml-1"
                            title="Remove adjustment"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      )
                    })
                  )}
                </div>
              )}
            </div>

            {/* Horizon, Replications & Strategy Override */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                  Simulation Horizon
                </label>
                <div className="grid grid-cols-5 gap-1">
                  {[30, 60, 120, 240, 480].map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHorizonMinutes(h)}
                      className={`py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                        horizonMinutes === h
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {h}m
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                  CRN Replications
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {[10, 20, 30].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReplications(r)}
                      className={`py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                        replications === r
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {r} reps
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                  Strategy Override
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

            {/* Small Baseline Queue Guidance */}
            {displayedWaiting > 0 && displayedWaiting <= 5 && horizonMinutes <= 60 && (
              <div className="p-3 bg-sky-50 border border-sky-200 text-sky-900 rounded-xl text-xs flex items-start gap-2 animate-fadeIn">
                <Lightbulb size={16} className="text-sky-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <span className="font-bold">Small baseline queue ({displayedWaiting} waiting): </span>
                  With only {displayedWaiting} waiting and a {horizonMinutes}-minute horizon, even the right fix may show a small effect. If the improvement is hard to see, use <strong>Emergency Surge</strong> to build a larger queue, or go to <strong>120m</strong> or <strong>240m</strong>.
                </p>
              </div>
            )}
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
              {/* Honest Messaging Banner Chosen Directly from Data */}
              {result.message && (
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3 shadow-xs ${
                    result.message.type === 'empty_queue'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : result.message.type === 'no_demand'
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : result.message.type === 'not_bottleneck'
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : result.message.type === 'mixed'
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : result.message.type === 'worse'
                      ? 'bg-rose-50 border-rose-300 text-rose-950'
                      : result.message.type === 'improvement' || result.statistical_summary?.is_significant
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      result.message.type === 'empty_queue' || result.message.type === 'no_demand'
                        ? 'bg-amber-500 text-white'
                        : result.message.type === 'not_bottleneck' || result.message.type === 'mixed'
                        ? 'bg-amber-600 text-white'
                        : result.message.type === 'worse'
                        ? 'bg-rose-600 text-white'
                        : result.message.type === 'improvement' || result.statistical_summary?.is_significant
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-700 text-white'
                    }`}
                  >
                    {result.message.type === 'improvement' || (result.message.type !== 'mixed' && result.message.type !== 'worse' && result.message.type !== 'not_bottleneck' && result.message.type !== 'empty_queue' && result.message.type !== 'no_demand' && result.statistical_summary?.is_significant) ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <AlertTriangle size={18} />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-sm">
                        {result.message.type === 'empty_queue'
                          ? 'Empty Queue (No Relievable Congestion)'
                          : result.message.type === 'no_demand'
                          ? 'No Patient Demand for Resource'
                          : result.message.type === 'not_bottleneck'
                          ? 'No Measurable Relieving Effect'
                          : result.message.type === 'mixed'
                          ? '⚡ Mixed Operational Effect'
                          : result.message.type === 'worse'
                          ? '⚠️ Operational Degradation'
                          : result.message.type === 'improvement' || result.statistical_summary?.is_significant
                          ? '✨ Statistically Significant Improvement'
                          : 'Operational Result'}
                      </h4>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-white/70 font-semibold border">
                        {result.statistical_summary?.replications ?? replications} CRN Replications
                      </span>
                    </div>
                    <p className="text-xs mt-1 leading-relaxed font-medium">
                      {result.message.text}
                    </p>
                  </div>
                </div>
              )}

              {/* Applied Capacity Changes Display */}
              {result.applied_changes && result.applied_changes.length > 0 && (
                <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-600 uppercase font-mono">
                      Applied Changes:
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {result.applied_changes.map((change, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono text-xs font-bold shadow-xs flex items-center gap-1.5"
                        >
                          <span>{change.display}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Forked copy isolated • Live engine unmutated
                  </span>
                </div>
              )}

              {/* Statistical Validity & Multi-Metric Holm-Bonferroni Significance */}
              {result.statistical_summary && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider font-mono text-slate-700">
                      Statistical Validity & Multi-Metric Holm-Bonferroni Correction
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        result.statistical_summary.is_significant
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {result.statistical_summary.is_significant
                        ? 'Significant (95% CI excludes 0)'
                        : 'Not Significant (95% CI includes 0)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                    {/* Wait Time Metric (Completed - Secondary Diagnostic) */}
                    {(() => {
                      const isZeroVar = Boolean(
                        result.statistical_summary.zero_variance?.wait ||
                        (result.statistical_summary.ci_wait_95[0] === 0 && result.statistical_summary.ci_wait_95[1] === 0 && result.delta.wait_minutes === 0)
                      )
                      const isImproved = result.delta.wait_minutes < 0
                      return (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 font-semibold uppercase">Completed Wait</span>
                            {result.statistical_summary.wait_significant && !isZeroVar && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                isImproved ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                              }`}>
                                {isImproved ? 'p < 0.05' : 'backlog cleared'}
                              </span>
                            )}
                          </div>
                          <strong className="text-slate-900 font-mono text-sm block mt-0.5">
                            {result.delta.wait_minutes > 0 ? '+' : ''}
                            {result.delta.wait_minutes.toFixed(2)} min
                          </strong>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            95% CI: {isZeroVar ? 'n/a (no variation)' : `[${result.statistical_summary.ci_wait_95[0].toFixed(2)}, ${result.statistical_summary.ci_wait_95[1].toFixed(2)}]`}
                          </span>
                          {result.statistical_summary.holm_bonferroni && (
                            <span className="text-[9px] text-slate-400 font-mono block">
                              adj p = {isZeroVar ? 'n/a (no variation)' : (
                                result.statistical_summary.holm_bonferroni.adj_p_wait < 0.001
                                  ? '< 0.001'
                                  : result.statistical_summary.holm_bonferroni.adj_p_wait.toFixed(3)
                              )}
                            </span>
                          )}
                        </div>
                      )
                    })()}

                    {/* Censoring-Aware Accrued Wait */}
                    {(() => {
                      const cwDelta = result.delta.censoring_aware_wait_minutes ?? 0
                      const ciCw = result.statistical_summary.ci_censored_wait_95 ?? [0, 0]
                      const isZeroVar = Boolean(
                        result.statistical_summary.zero_variance?.censored_wait ||
                        (ciCw[0] === 0 && ciCw[1] === 0 && cwDelta === 0)
                      )
                      const isImproved = cwDelta < 0
                      return (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 font-semibold uppercase">Accrued Wait</span>
                            {result.statistical_summary.censored_wait_significant && !isZeroVar && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                isImproved ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                p &lt; 0.05
                              </span>
                            )}
                          </div>
                          <strong className="text-slate-900 font-mono text-sm block mt-0.5">
                            {cwDelta > 0 ? '+' : ''}
                            {cwDelta.toFixed(2)} min
                          </strong>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            95% CI: {isZeroVar ? 'n/a (no variation)' : `[${ciCw[0].toFixed(2)}, ${ciCw[1].toFixed(2)}]`}
                          </span>
                          {result.statistical_summary.holm_bonferroni?.adj_p_censored_wait !== undefined && (
                            <span className="text-[9px] text-slate-400 font-mono block">
                              adj p = {isZeroVar ? 'n/a (no variation)' : (
                                result.statistical_summary.holm_bonferroni.adj_p_censored_wait < 0.001
                                  ? '< 0.001'
                                  : result.statistical_summary.holm_bonferroni.adj_p_censored_wait.toFixed(3)
                              )}
                            </span>
                          )}
                        </div>
                      )
                    })()}

                    {/* Discharges Metric */}
                    {(() => {
                      const isZeroVar = Boolean(
                        result.statistical_summary.zero_variance?.comp ||
                        ((result.statistical_summary.ci_comp_95?.[0] ?? 0) === 0 && (result.statistical_summary.ci_comp_95?.[1] ?? 0) === 0 && (result.delta.patients_completed ?? 0) === 0)
                      )
                      const isImproved = (result.delta.patients_completed ?? 0) > 0
                      return (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 font-semibold uppercase">Discharges</span>
                            {result.statistical_summary.comp_significant && !isZeroVar && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                isImproved ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                p &lt; 0.05
                              </span>
                            )}
                          </div>
                          <strong className="text-slate-900 font-mono text-sm block mt-0.5">
                            {result.delta.patients_completed > 0 ? '+' : ''}
                            {result.delta.patients_completed.toFixed(1)} completed
                          </strong>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            95% CI: {isZeroVar ? 'n/a (no variation)' : `[${result.statistical_summary.ci_comp_95?.[0].toFixed(1) ?? '0.0'}, ${result.statistical_summary.ci_comp_95?.[1].toFixed(1) ?? '0.0'}]`}
                          </span>
                          {result.statistical_summary.holm_bonferroni && (
                            <span className="text-[9px] text-slate-400 font-mono block">
                              adj p = {isZeroVar ? 'n/a (no variation)' : (
                                result.statistical_summary.holm_bonferroni.adj_p_comp < 0.001
                                  ? '< 0.001'
                                  : result.statistical_summary.holm_bonferroni.adj_p_comp.toFixed(3)
                              )}
                            </span>
                          )}
                        </div>
                      )
                    })()}

                    {/* End Queue Length Metric */}
                    {(() => {
                      const qDelta = result.delta.end_queue_length ?? 0
                      const ciQ = result.statistical_summary.ci_queue_95 ?? [0, 0]
                      const isZeroVar = Boolean(
                        result.statistical_summary.zero_variance?.queue ||
                        (ciQ[0] === 0 && ciQ[1] === 0 && qDelta === 0)
                      )
                      const isImproved = qDelta < 0
                      return (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 font-semibold uppercase">End Queue</span>
                            {result.statistical_summary.queue_significant && !isZeroVar && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                isImproved ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                p &lt; 0.05
                              </span>
                            )}
                          </div>
                          <strong className="text-slate-900 font-mono text-sm block mt-0.5">
                            {qDelta > 0 ? '+' : ''}
                            {qDelta.toFixed(1)} waiting
                          </strong>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            95% CI: {isZeroVar ? 'n/a (no variation)' : `[${ciQ[0].toFixed(1)}, ${ciQ[1].toFixed(1)}]`}
                          </span>
                          {result.statistical_summary.holm_bonferroni?.adj_p_queue !== undefined && (
                            <span className="text-[9px] text-slate-400 font-mono block">
                              adj p = {isZeroVar ? 'n/a (no variation)' : (
                                result.statistical_summary.holm_bonferroni.adj_p_queue < 0.001
                                  ? '< 0.001'
                                  : result.statistical_summary.holm_bonferroni.adj_p_queue.toFixed(3)
                              )}
                            </span>
                          )}
                        </div>
                      )
                    })()}

                    {/* SLA Breaches Metric (Censoring-Aware) */}
                    {(() => {
                      const slaDelta = result.delta.sla_violations_all ?? result.delta.sla_violations ?? 0
                      const ciSla = result.statistical_summary.ci_sla_all_95 ?? result.statistical_summary.ci_sla_95 ?? [0, 0]
                      const isZeroVar = Boolean(
                        result.statistical_summary.zero_variance?.sla_all ||
                        result.statistical_summary.zero_variance?.sla ||
                        (ciSla[0] === 0 && ciSla[1] === 0 && slaDelta === 0)
                      )
                      const isImproved = slaDelta < 0
                      const isSlaSig = result.statistical_summary.sla_all_significant ?? result.statistical_summary.sla_significant
                      const adjPSla = result.statistical_summary.holm_bonferroni?.adj_p_sla_all ?? result.statistical_summary.holm_bonferroni?.adj_p_sla
                      return (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 font-semibold uppercase">SLA Breaches (All)</span>
                            {isSlaSig && !isZeroVar && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                isImproved ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                p &lt; 0.05
                              </span>
                            )}
                          </div>
                          <strong className="text-slate-900 font-mono text-sm block mt-0.5">
                            {slaDelta > 0 ? '+' : ''}
                            {slaDelta.toFixed(1)} breaches
                          </strong>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            95% CI: {isZeroVar ? 'n/a (no variation)' : `[${ciSla[0].toFixed(1)}, ${ciSla[1].toFixed(1)}]`}
                          </span>
                          {adjPSla !== undefined && (
                            <span className="text-[9px] text-slate-400 font-mono block">
                              adj p = {isZeroVar ? 'n/a (no variation)' : (
                                adjPSla < 0.001
                                  ? '< 0.001'
                                  : adjPSla.toFixed(3)
                              )}
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* Side by Side Comparative Metrics Grid (6 Complete Clinical Metrics) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Metric 1: Completed Average Wait Time (Secondary Diagnostic) */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider font-mono">Completed Avg Wait</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">
                        Secondary
                      </span>
                    </div>
                    <div className="relative group cursor-pointer" title="Rises when a backlog clears as long-waiting queued patients are discharged">
                      <Info size={15} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
                      <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block w-52 p-2 bg-slate-900 text-white text-[10px] rounded-lg shadow-xl z-30 leading-relaxed font-normal pointer-events-none">
                        Rises when a backlog clears as long-waiting queued patients finally get treated. Not an operational regression.
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-2">Discharged patients only (rises when backlog clears)</p>
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
                        result.delta.wait_minutes < 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : result.delta.wait_minutes > 0
                          ? 'bg-slate-100 text-slate-700 font-mono'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                      title={result.delta.wait_minutes > 0 ? 'Rises as long-waiting queued patients are discharged' : undefined}
                    >
                      {result.delta.wait_minutes < 0 ? (
                        <TrendingDown size={12} />
                      ) : null}
                      <span>
                        {result.delta.wait_minutes > 0 ? '+' : ''}
                        {result.delta.wait_minutes.toFixed(1)}m
                        {result.delta.wait_minutes > 0 ? ' (backlog)' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metric 2: Censoring-Aware Accrued Wait */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider font-mono">Censoring-Aware Wait</span>
                    <Activity size={15} />
                  </div>
                  <p className="text-[10px] text-slate-400 mb-2">All patients (completed + queued)</p>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-lg font-black text-slate-900">
                        {(result.counterfactual.censoring_aware_wait_minutes ?? result.counterfactual.average_wait_minutes).toFixed(1)}m
                      </div>
                      <div className="text-[10px] text-slate-400 line-through">
                        Baseline: {(result.baseline.censoring_aware_wait_minutes ?? result.baseline.average_wait_minutes).toFixed(1)}m
                      </div>
                    </div>
                    {(() => {
                      const dCw = result.delta.censoring_aware_wait_minutes ?? 0
                      return (
                        <div
                          className={`flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-full ${
                            dCw < 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : dCw > 0
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {dCw < 0 ? <TrendingDown size={12} /> : dCw > 0 ? <TrendingUp size={12} /> : null}
                          <span>
                            {dCw > 0 ? '+' : ''}
                            {dCw.toFixed(1)}m
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* Metric 3: End-of-Horizon Queue Length */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider font-mono">End Queue Length</span>
                    <Users size={15} />
                  </div>
                  <p className="text-[10px] text-slate-400 mb-2">Patients waiting at horizon end</p>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-lg font-black text-slate-900">
                        {typeof result.counterfactual.end_queue_length === 'number'
                          ? result.counterfactual.end_queue_length.toFixed(1)
                          : '0.0'}
                      </div>
                      <div className="text-[10px] text-slate-400 line-through">
                        Baseline: {typeof result.baseline.end_queue_length === 'number'
                          ? result.baseline.end_queue_length.toFixed(1)
                          : '0.0'}
                      </div>
                    </div>
                    {(() => {
                      const dQ = result.delta.end_queue_length ?? 0
                      return (
                        <div
                          className={`flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-full ${
                            dQ < 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : dQ > 0
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {dQ < 0 ? <TrendingDown size={12} /> : dQ > 0 ? <TrendingUp size={12} /> : null}
                          <span>
                            {dQ > 0 ? '+' : ''}
                            {dQ.toFixed(1)}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* Metric 4: Throughput / Discharges */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider font-mono">Discharges</span>
                    <ArrowRight size={15} />
                  </div>
                  <p className="text-[10px] text-slate-400 mb-2">Completed patient throughput</p>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-lg font-black text-slate-900">
                        {typeof result.counterfactual.patients_completed === 'number'
                          ? result.counterfactual.patients_completed.toFixed(1)
                          : result.counterfactual.patients_completed}
                      </div>
                      <div className="text-[10px] text-slate-400 line-through">
                        Baseline: {typeof result.baseline.patients_completed === 'number'
                          ? result.baseline.patients_completed.toFixed(1)
                          : result.baseline.patients_completed}
                      </div>
                    </div>
                    <div
                      className={`flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-full ${
                        result.delta.patients_completed > 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : result.delta.patients_completed < 0
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {result.delta.patients_completed > 0 ? (
                        <TrendingUp size={12} />
                      ) : result.delta.patients_completed < 0 ? (
                        <TrendingDown size={12} />
                      ) : null}
                      <span>
                        {result.delta.patients_completed > 0 ? '+' : ''}
                        {typeof result.delta.patients_completed === 'number'
                          ? result.delta.patients_completed.toFixed(1)
                          : result.delta.patients_completed}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metric 5: SLA Breaches (All Censoring-Aware) */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider font-mono">SLA Breaches (All)</span>
                    <ShieldCheck size={15} />
                  </div>
                  <p className="text-[10px] text-slate-400 mb-2">Censoring-aware (completed + still waiting)</p>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-lg font-black text-slate-900">
                        {(result.counterfactual.sla_violations_all ?? result.counterfactual.sla_violations).toFixed(1)}
                      </div>
                      <div className="text-[10px] text-slate-400 line-through">
                        Baseline: {(result.baseline.sla_violations_all ?? result.baseline.sla_violations).toFixed(1)}
                      </div>
                    </div>
                    {(() => {
                      const dSla = result.delta.sla_violations_all ?? result.delta.sla_violations
                      return (
                        <div
                          className={`flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-full ${
                            dSla < 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : dSla > 0
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {dSla < 0 ? <TrendingDown size={12} /> : dSla > 0 ? <TrendingUp size={12} /> : null}
                          <span>
                            {dSla > 0 ? '+' : ''}
                            {dSla.toFixed(1)}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500 font-mono">
                    Started/completed only: {(result.counterfactual.sla_violations_completed ?? result.counterfactual.sla_violations).toFixed(1)} vs {(result.baseline.sla_violations_completed ?? result.baseline.sla_violations).toFixed(1)} baseline
                  </div>
                </div>

                {/* Metric 6: P90 Wait Time */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider font-mono">P90 Wait Time</span>
                    <Timer size={15} />
                  </div>
                  <p className="text-[10px] text-slate-400 mb-2">90th percentile wait duration</p>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-lg font-black text-slate-900">
                        {typeof result.counterfactual.p90_wait_minutes === 'number'
                          ? result.counterfactual.p90_wait_minutes.toFixed(1)
                          : '0.0'}m
                      </div>
                      <div className="text-[10px] text-slate-400 line-through">
                        Baseline: {typeof result.baseline.p90_wait_minutes === 'number'
                          ? result.baseline.p90_wait_minutes.toFixed(1)
                          : '0.0'}m
                      </div>
                    </div>
                    {(() => {
                      const dP90 = result.delta.p90_wait_minutes ?? 0
                      return (
                        <div
                          className={`flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-full ${
                            dP90 < 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : dP90 > 0
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {dP90 < 0 ? <TrendingDown size={12} /> : dP90 > 0 ? <TrendingUp size={12} /> : null}
                          <span>
                            {dP90 > 0 ? '+' : ''}
                            {dP90.toFixed(1)}m
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>

              {/* Per-Change Contribution Breakdown */}
              {result.per_change_contributions && result.per_change_contributions.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider font-mono text-slate-700">
                        Per-Change Contribution Analysis
                      </span>
                      <span className="text-[10px] text-slate-500">
                        (Simulated individually with identical CRN seeds against baseline)
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      Isolates marginal queue relief
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5">
                    {result.per_change_contributions.map((contrib, idx) => {
                      const isDriver = contrib.impact === 'primary_driver'
                      const isPositive = contrib.impact === 'positive'
                      const isNoEffect = contrib.impact === 'no_effect'

                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                            isDriver
                              ? 'bg-emerald-50/70 border-emerald-300'
                              : isPositive
                              ? 'bg-sky-50/60 border-sky-200'
                              : isNoEffect
                              ? 'bg-slate-50 border-slate-200 opacity-80'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full font-mono shrink-0 ${
                                isDriver
                                  ? 'bg-emerald-600 text-white font-black shadow-xs'
                                  : isPositive
                                  ? 'bg-sky-600 text-white font-bold'
                                  : isNoEffect
                                  ? 'bg-slate-200 text-slate-600'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {contrib.impact_label}
                            </span>
                            <div>
                              <span className="text-xs font-bold text-slate-900 font-mono block">
                                {contrib.display}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {contrib.department} {contrib.resource} capacity
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-xs font-mono shrink-0 flex-wrap">
                            <div>
                              <span className="text-[9px] uppercase text-slate-400 block font-sans">Accrued Wait</span>
                              <span
                                className={`font-bold ${
                                  contrib.delta_censoring_aware_wait < 0
                                    ? 'text-emerald-700'
                                    : contrib.delta_censoring_aware_wait > 0
                                    ? 'text-rose-700'
                                    : 'text-slate-700'
                                }`}
                              >
                                {contrib.delta_censoring_aware_wait > 0 ? '+' : ''}
                                {contrib.delta_censoring_aware_wait.toFixed(2)}m
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase text-slate-400 block font-sans">End Queue</span>
                              <span
                                className={`font-bold ${
                                  contrib.delta_end_queue < 0
                                    ? 'text-emerald-700'
                                    : contrib.delta_end_queue > 0
                                    ? 'text-rose-700'
                                    : 'text-slate-700'
                                }`}
                              >
                                {contrib.delta_end_queue > 0 ? '+' : ''}
                                {contrib.delta_end_queue.toFixed(1)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase text-slate-400 block font-sans">Discharges</span>
                              <span
                                className={`font-bold ${
                                  contrib.delta_patients_completed > 0
                                    ? 'text-emerald-700'
                                    : contrib.delta_patients_completed < 0
                                    ? 'text-rose-700'
                                    : 'text-slate-700'
                                }`}
                              >
                                {contrib.delta_patients_completed > 0 ? '+' : ''}
                                {contrib.delta_patients_completed.toFixed(1)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase text-slate-400 block font-sans">SLA Breaches (All)</span>
                              <span
                                className={`font-bold ${
                                  contrib.delta_sla_all < 0
                                    ? 'text-emerald-700'
                                    : contrib.delta_sla_all > 0
                                    ? 'text-rose-700'
                                    : 'text-slate-700'
                                }`}
                              >
                                {contrib.delta_sla_all > 0 ? '+' : ''}
                                {contrib.delta_sla_all.toFixed(1)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
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
                  <span>Simulating {replications} CRN Replications...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>Run Counterfactual ({replications} Reps)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
