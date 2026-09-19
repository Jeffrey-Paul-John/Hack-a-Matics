import { useState } from 'react'
import { AlertTriangle, BarChart2, FastForward, Play, Siren, StepForward, UserRoundX } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { ResourcePool, Strategy } from '../api/types'

type Props = {
  strategy: Strategy
  resources?: Record<string, Record<string, ResourcePool>>
  onStart: () => void
  onStep: () => void
  onRun: () => void
  onCompare: () => void
  onStrategy: (strategy: Strategy) => void
}

export function ScenarioControls({
  strategy,
  resources,
  onStart,
  onStep,
  onRun,
  onCompare,
  onStrategy,
}: Props) {
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState<string>('')
  const [selectedResourceType, setSelectedResourceType] = useState<string>('')

  // Fetch dynamic metadata from backend configuration
  const metaQuery = useQuery({
    queryKey: ['meta-config'],
    queryFn: api.meta,
    staleTime: 60000,
  })

  // Extract live available assets from active simulation state
  const availableAssets = Object.entries(resources || {}).flatMap(([dept, pools]) =>
    Object.entries(pools).flatMap(([kind, pool]) =>
      (pool.items || [])
        .filter(item => item.status === 'AVAILABLE')
        .map(item => ({
          id: item.id,
          label: `${item.id} (${dept} ${kind.replace('_', ' ')})`,
        }))
    )
  )

  // Extract available resource types from live state or backend metadata
  const resourceTypes =
    metaQuery.data?.resource_types ||
    Array.from(new Set(Object.values(resources || {}).flatMap(pools => Object.keys(pools))))

  // Extract strategies from config metadata
  const strategies = metaQuery.data?.strategies || [
    'urgency_only',
    'wait_aware',
    'resource_aware',
    'mdp_optimal',
  ]

  const showFeedback = (msg: string) => {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 3500)
  }

  const handleAction = async (name: string, action: () => Promise<unknown>) => {
    try {
      setIsBusy(true)
      await action()
      showFeedback(`✓ ${name} applied`)
    } catch (err: unknown) {
      showFeedback(`✕ ${name} failed: ${err instanceof Error ? err.message : 'error'}`)
    } finally {
      setIsBusy(false)
    }
  }

  const handleFailTarget = () => {
    const target = selectedAssetId || (availableAssets.length > 0 ? availableAssets[0].id : null)
    if (!target) {
      showFeedback('✕ No active available resources to fail')
      return
    }
    void handleAction(`Asset Failure (${target})`, () => api.failResource(target))
  }

  const handleShortageTarget = () => {
    const targetType = selectedResourceType || (resourceTypes.length > 0 ? resourceTypes[0] : null)
    if (!targetType) {
      showFeedback('✕ No resource types available for shortage')
      return
    }
    void handleAction(`25% ${targetType} Shortage`, () => api.shortage(targetType, 0.25))
  }

  return (
    <section className="flex flex-col gap-5">
      {/* Top Bar: Stepping Controls & Strategy Policy */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            className="btn-primary"
            onClick={onStart}
            disabled={isBusy}
            title="Re-seed and restart simulation shift"
          >
            <Play size={14} className="fill-white" />
            <span>Start New Shift</span>
          </button>

          <button
            className="btn-secondary"
            onClick={onStep}
            disabled={isBusy}
            title="Advance exactly one arrival or departure event"
          >
            <StepForward size={14} className="text-slate-700" />
            <span>Advance Single Event</span>
          </button>

          <button
            className="btn-secondary"
            onClick={onRun}
            disabled={isBusy}
            title="Advance clock by 60 minutes headlessly"
          >
            <FastForward size={14} className="text-slate-700" />
            <span>Fast-Forward 60 Min</span>
          </button>
        </div>

        {/* Active Policy Selector & Monte Carlo Evaluation */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <span className="text-xs text-slate-500 font-semibold">Triage Policy:</span>
            <select
              value={strategy}
              onChange={e => onStrategy(e.target.value as Strategy)}
              aria-label="Allocation strategy"
              className="border-none bg-transparent text-xs font-bold text-slate-900 cursor-pointer focus:outline-none capitalize"
            >
              {strategies.map(strat => (
                <option key={strat} value={strat}>
                  {strat.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn-dark"
            onClick={onCompare}
            disabled={isBusy}
            title="Execute Monte Carlo comparison across 30 seeded replications"
          >
            <BarChart2 size={14} />
            <span>Compare 30 Runs</span>
          </button>
        </div>
      </div>

      {/* Bottom Section: Operational Shocks Console */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-data flex items-center gap-2">
              <AlertTriangle size={13} className="text-amber-500" />
              <span>Operational Shock Injector Deck</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Inject real-time stress testing shocks to evaluate clinical elasticity and rollback integrity.
            </p>
          </div>
          <span className="data-label text-[10px] text-slate-500 font-mono">
            FAIL-SAFE ATOMIC ROLLBACK
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Shock 1: Demand Surge Card */}
          <div className="bg-slate-50/70 border border-slate-200/90 rounded-xl p-4 flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Siren size={15} className="text-red-500" /> Demand Surge
                </span>
                <span className="status-pill red">2x Multiplier</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                Doubles incoming arrival rate across triage queues for mass casualty testing.
              </p>
            </div>
            <button
              className="btn-danger mt-3 w-full"
              onClick={() => handleAction('Surge 2x', api.surge)}
              disabled={isBusy}
            >
              <Siren size={13} />
              <span>Inject Demand Surge</span>
            </button>
          </div>

          {/* Shock 2: Staff / Resource Shortage Card */}
          <div className="bg-slate-50/70 border border-slate-200/90 rounded-xl p-4 flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <UserRoundX size={15} className="text-amber-500" /> Resource Shortage
                </span>
                <span className="status-pill amber">-25% Capacity</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                Reduces capacity in the selected staff or equipment pool by 25%.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <select
                value={selectedResourceType || (resourceTypes[0] || '')}
                onChange={e => setSelectedResourceType(e.target.value)}
                aria-label="Select resource type for shortage"
                className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 cursor-pointer focus:outline-none"
              >
                {resourceTypes.map(type => (
                  <option key={type} value={type}>
                    {type.replace('_', ' ')}
                  </option>
                ))}
              </select>
              <button
                className="btn-warning shrink-0"
                onClick={handleShortageTarget}
                disabled={isBusy || resourceTypes.length === 0}
              >
                <UserRoundX size={13} />
                <span>Apply</span>
              </button>
            </div>
          </div>

          {/* Shock 3: Asset Failure Card */}
          <div className="bg-slate-50/70 border border-slate-200/90 rounded-xl p-4 flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <AlertTriangle size={15} className="text-slate-700" /> Asset Failure
                </span>
                <span className="status-pill black">Breakdown</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                Marks an active clinical unit as out-of-service for maintenance.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <select
                value={selectedAssetId || (availableAssets[0]?.id || '')}
                onChange={e => setSelectedAssetId(e.target.value)}
                aria-label="Select live asset to fail"
                className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 cursor-pointer focus:outline-none truncate"
              >
                {availableAssets.length > 0 ? (
                  availableAssets.map(asset => (
                    <option key={asset.id} value={asset.id}>
                      {asset.label}
                    </option>
                  ))
                ) : (
                  <option value="">No available assets</option>
                )}
              </select>
              <button
                className="btn-secondary shrink-0 text-slate-900 hover:bg-slate-100"
                onClick={handleFailTarget}
                disabled={isBusy || availableAssets.length === 0}
              >
                <AlertTriangle size={13} className="text-red-500" />
                <span>Breakdown</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Feedback Notification Toast */}
      {feedback && (
        <div className="text-xs font-mono font-bold px-3.5 py-2 bg-slate-900 text-white rounded-lg border border-slate-800 flex items-center justify-between animate-fadeIn shadow-lg">
          <span>{feedback}</span>
          <span className="text-[10px] text-slate-400">STATUS TELEMETRY UPDATED</span>
        </div>
      )}
    </section>
  )
}
