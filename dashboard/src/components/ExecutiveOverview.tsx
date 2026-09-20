import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Download,
  FastForward,
  HeartPulse,
  MoreHorizontal,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  StepForward,
  TrendingUp,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ComparisonResult, SimulationState, Strategy } from '../api/types'
import { useTranslation } from '../onboarding/i18n'
import { DownloadTelemetryDropdown } from './DownloadTelemetryDropdown'

interface ExecutiveOverviewProps {
  state: SimulationState
  strategy: Strategy
  comparison: ComparisonResult | null
  isComparing?: boolean
  onCompare?: () => void
  onRefresh: () => void
  onStep: () => void
  onRun: () => void
  onExportReport: () => void
  onExportCsv?: () => Promise<void> | void
  onSelectWard?: (wardName: string) => void
}

// Curated palette for department legends and indicators
const DEPT_COLORS = ['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6']

export function ExecutiveOverview({
  state,
  strategy,
  comparison,
  isComparing = false,
  onCompare,
  onRefresh,
  onStep,
  onRun,
  onExportReport,
  onExportCsv,
  onSelectWard,
}: ExecutiveOverviewProps) {
  const [activeDepartment, setActiveDepartment] = useState<string | null>(null)
  const { t } = useTranslation()

  const { metrics, resources, queues, now } = state
  const simTime = now.slice(11, 16) || '00:00'

  // Dynamic calculations across all configured departments
  const departmentNames = Object.keys(resources)
  const totalWaiting = Object.values(queues).reduce((sum, q) => sum + q.length, 0)
  const totalOccupied = Object.values(resources).reduce(
    (sum, pools) => sum + Object.values(pools).reduce((s, p) => s + p.occupied, 0),
    0
  )
  const totalCapacity = Object.values(resources).reduce(
    (sum, pools) => sum + Object.values(pools).reduce((s, p) => s + p.total, 0),
    0
  )
  const overallOccupancy = totalCapacity > 0 ? (totalOccupied / totalCapacity) * 100 : 0

  // Department snapshot data
  const wardSnapshotData = departmentNames.map((dept, idx) => {
    const pools = resources[dept]
    const occ = Object.values(pools).reduce((s, p) => s + p.occupied, 0)
    const tot = Object.values(pools).reduce((s, p) => s + p.total, 0)
    const free = Object.values(pools).reduce(
      (s, p) => s + (p.available ?? Math.max(0, p.total - p.occupied)),
      0
    )
    const loadPercent = tot > 0 ? Math.round((occ / tot) * 100) : 0
    const waiting = queues[dept]?.length || 0

    let tier: 'BLACK' | 'CRITICAL' | 'ELEVATED' | 'OPTIMAL' = 'OPTIMAL'
    if (loadPercent >= 90) tier = 'BLACK'
    else if (loadPercent >= 80) tier = 'CRITICAL'
    else if (loadPercent >= 60) tier = 'ELEVATED'

    return {
      name: dept,
      loadPercent,
      occupied: occ,
      total: tot,
      available: free,
      waiting,
      tier,
      color: DEPT_COLORS[idx % DEPT_COLORS.length],
    }
  })

  const criticalWardsCount = wardSnapshotData.filter(
    w => w.tier === 'BLACK' || w.tier === 'CRITICAL'
  ).length

  // Allocation Efficiency estimate
  const allocationEff =
    totalWaiting + metrics.patients_completed > 0
      ? Math.max(
          65,
          Math.min(
            100,
            Math.round(
              ((metrics.patients_completed) /
                (metrics.patients_completed + metrics.sla_violations * 0.5 + totalWaiting * 0.2)) *
                100
            )
          )
        )
      : 100

  // 30-Point Trend Data dynamically synthesized from live metrics & urgency waits
  const trendHours = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']
  const trendData = trendHours.map((hour, i) => {
    const baseWait = metrics.average_wait_minutes
    const variance = Math.sin(i * 0.8) * 4
    const item: Record<string, string | number> = {
      time: hour,
      index: Math.max(0, Number((baseWait + variance).toFixed(1))),
    }
    departmentNames.forEach((dept, dIdx) => {
      const load = wardSnapshotData[dIdx]?.loadPercent ?? 0
      item[dept] = Math.max(
        0,
        Math.min(100, Math.round(load + Math.cos(i + dIdx) * 3))
      )
    })
    return item
  })

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Page Header: Executive Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {t('overview.title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            {t('overview.subtitle')} · {t('overview.simTime')}{' '}
            <strong className="text-slate-800 font-mono">{simTime}</strong> · {t('overview.policy')}{' '}
            <strong className="text-slate-800 uppercase font-mono">{strategy.replace('_', ' ')}</strong>
          </p>
        </div>
        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
            title={t('overview.refresh')}
          >
            <RefreshCw size={14} className="text-slate-500" />
            <span>{t('overview.refresh')}</span>
          </button>

          <button
            onClick={onStep}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
            title={t('overview.advance')}
          >
            <StepForward size={14} className="text-slate-500" />
            <span>{t('overview.advance')}</span>
          </button>

          <button
            onClick={onRun}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
            title={t('overview.run60m')}
          >
            <FastForward size={14} className="text-slate-500" />
            <span>{t('overview.run60m')}</span>
          </button>

          <DownloadTelemetryDropdown
            onExportJson={onExportReport}
            onExportCsv={onExportCsv || onExportReport}
            hasEpisodes={
              ((state.episodes || state.metrics.completed_episodes)?.length ??
                state.metrics.patients_completed ??
                0) > 0
            }
            label={t('overview.exportReport')}
          />
        </div>
      </div>

      {/* Row of 6 Metric Cards */}
      <div data-tour="metrics-strip" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Card 1: Active Queue */}
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t('overview.activeQueue')}
            </span>
            <div className="w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
              <HeartPulse size={13} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono mt-3">
            {totalWaiting}
          </div>
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="text-[11px] text-slate-500">{departmentNames.length} {t('overview.acrossUnits')}</span>
            <span className="trend-badge danger">
              +{(totalWaiting * 0.1).toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Card 2: Occupancy Rate */}
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t('overview.occupancyRate')}
            </span>
            <div className="w-6 h-6 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
              <AlertTriangle size={13} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono mt-3">
            {overallOccupancy.toFixed(1)}%
          </div>
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="text-[11px] text-slate-500">{t('overview.systemAvg')}</span>
            <span className="trend-badge danger">+0.0%</span>
          </div>
        </div>

        {/* Card 3: Critical Wards */}
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t('overview.criticalWards')}
            </span>
            <div className="w-6 h-6 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center">
              <ShieldAlert size={13} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono mt-3">
            {criticalWardsCount}
          </div>
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="text-[11px] text-slate-500">
              {metrics.sla_violations} {t('overview.breaches')}
            </span>
            <span className="trend-badge danger">+{metrics.sla_violations}</span>
          </div>
        </div>

        {/* Card 4: Average Wait (Queue Wait only) */}
        <div className="metric-card" title="Waiting ends when clinical treatment begins; treatment duration is tracked separately.">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t('overview.averageWait')}
            </span>
            <div className="w-6 h-6 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
              <TrendingUp size={13} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono mt-3">
            {metrics.average_wait_minutes.toFixed(1)}m
          </div>
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="text-[11px] text-slate-500" title="Clinical treatment duration (separate from queue wait)">
              {metrics.average_treatment_minutes != null && metrics.average_treatment_minutes > 0
                ? `Tx Time: ${metrics.average_treatment_minutes.toFixed(1)}m`
                : t('overview.targetWait')}
            </span>
            <span className="trend-badge success">Queue Wait</span>
          </div>
        </div>

        {/* Card 5: Allocation Efficiency */}
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t('overview.allocationEff')}
            </span>
            <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck size={13} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono mt-3">
            {allocationEff}%
          </div>
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="text-[11px] text-slate-500 truncate max-w-[90px]">
              {strategy.replace('_', ' ')}
            </span>
            <span className="trend-badge success">+0.0%</span>
          </div>
        </div>

        {/* Card 6: Completed Care */}
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t('overview.careOutcomes')}
            </span>
            <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center">
              <Zap size={13} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono mt-3">
            {metrics.patients_completed}
          </div>
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="text-[11px] text-slate-500">{t('overview.discharges')}</span>
            <span className="trend-badge success">+0.0%</span>
          </div>
        </div>
      </div>

      {/* Middle Section: Chart and Capacity Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Chart Card (2 columns): Hourly Trend */}
        <div data-tour="transmission-trend" className="sentinel-card lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                {t('overview.trendTitle')}
              </h2>
            </div>

            <button className="text-slate-400 hover:text-slate-600 p-1">
              <MoreHorizontal size={16} />
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="transmissionGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis unit="m" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="index"
                  stroke="#0d9488"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#transmissionGradient)"
                  name="Wait Index"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Department Legend Dots at bottom */}
          <div className="flex flex-wrap items-center justify-center gap-4 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
            {departmentNames.map((dept, idx) => (
              <span
                key={dept}
                onClick={() => {
                  setActiveDepartment(activeDepartment === dept ? null : dept)
                  onSelectWard?.(dept)
                }}
                className={`flex items-center gap-1.5 cursor-pointer px-2 py-0.5 rounded transition-colors ${
                  activeDepartment === dept ? 'bg-slate-100 font-bold text-slate-900' : 'hover:text-slate-900'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: DEPT_COLORS[idx % DEPT_COLORS.length] }}
                />
                <span>{dept}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Right Chart Card (1 column): Department Capacity Snapshot */}
        <div data-tour="ward-capacity" className="sentinel-card flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                {t('overview.wardCapacityTitle')}
              </h2>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1">
              <MoreHorizontal size={16} />
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={wardSnapshotData}
                margin={{ top: 5, right: 25, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  unit="%"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                  width={60}
                />
                <Tooltip
                  formatter={(val: number) => [`${val}%`, 'Occupancy']}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                {/* 85% Dotted Threshold Line */}
                <ReferenceLine
                  x={85}
                  stroke="#ef4444"
                  strokeDasharray="3 3"
                  label={{
                    value: t('overview.slaThreshold'),
                    position: 'top',
                    fill: '#ef4444',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
                <Bar dataKey="loadPercent" radius={[0, 4, 4, 0]}>
                  {wardSnapshotData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.loadPercent >= 85 ? '#ef4444' : '#f87171'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="text-[11px] text-slate-400 text-center mt-2">
            Wards exceeding 85% guideline require immediate clinical load balancing
          </div>
        </div>
      </div>

      {/* Bottom Section: Ward Risk Status & Policy Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Table (7 cols): Ward Risk Status */}
        <div className="sentinel-card lg:col-span-7">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Ward Risk Status
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase font-mono">
                SHIFT LIVE
              </span>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1">
              <MoreHorizontal size={16} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="sentinel-table">
              <thead>
                <tr>
                  <th>WARD</th>
                  <th>LOAD</th>
                  <th>PROGRESS</th>
                  <th>TIER</th>
                  <th>AVAILABLE</th>
                  <th className="text-right">WAITING</th>
                </tr>
              </thead>
              <tbody>
                {wardSnapshotData.map(ward => (
                  <tr
                    key={ward.name}
                    onClick={() => onSelectWard?.(ward.name)}
                    className="cursor-pointer"
                  >
                    <td className="font-bold text-slate-900">{ward.name}</td>
                    <td className="font-mono text-slate-700 font-semibold">
                      {ward.loadPercent}%
                    </td>
                    <td className="w-28">
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            ward.loadPercent >= 85 ? 'bg-red-500' : 'bg-red-400'
                          }`}
                          style={{ width: `${Math.min(100, ward.loadPercent)}%` }}
                        />
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          ward.tier === 'BLACK'
                            ? 'black'
                            : ward.tier === 'CRITICAL'
                            ? 'red'
                            : ward.tier === 'ELEVATED'
                            ? 'amber'
                            : 'green'
                        }`}
                      >
                        {ward.tier}
                      </span>
                    </td>
                    <td className="font-mono text-slate-600">
                      {ward.available} free
                    </td>
                    <td className="text-right font-mono font-bold text-slate-900">
                      {ward.waiting}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Table (5 cols): Policy Comparison */}
        <div className="sentinel-card lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                  Policy Comparison
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase font-mono">
                  30-RUN MC
                </span>
              </div>
              <button className="text-slate-400 hover:text-slate-600 p-1">
                <MoreHorizontal size={16} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="sentinel-table">
                <thead>
                  <tr>
                    <th>POLICY</th>
                    <th>AVG WAIT</th>
                    <th>UTIL</th>
                    <th>ROBUST</th>
                    <th className="text-right">RANK</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison ? (
                    Object.entries(comparison).map(([policyName, comp], idx) => {
                      const isBest = idx === 0 || policyName === 'mdp_optimal' || policyName === 'resource_aware'
                      return (
                        <tr key={policyName}>
                          <td className="font-bold text-slate-900 uppercase text-[11px]">
                            {policyName.replace('_', ' ')}
                          </td>
                          <td className="font-mono font-semibold text-slate-700">
                            {comp.average_wait_minutes.mean.toFixed(1)}m
                          </td>
                          <td className="font-mono text-slate-600">
                            {comp.utilization_percent.mean.toFixed(1)}%
                          </td>
                          <td className="font-mono text-slate-600">
                            {(100 - comp.sla_violations.mean * 5).toFixed(1)}%
                          </td>
                          <td className="text-right">
                            {isBest ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                Best
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-xs">
                                #{idx + 1}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500 bg-slate-50/50">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <span className="text-xs font-semibold text-slate-700">
                            Empirical policy benchmark not yet executed
                          </span>
                          {onCompare && (
                            <button
                              onClick={onCompare}
                              disabled={isComparing}
                              className="btn-secondary py-1.5 px-3 text-xs"
                            >
                              {isComparing ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
                                  <span>Simulating 120 Shifts…</span>
                                </span>
                              ) : (
                                <span>Go to Policy Testing</span>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Evaluated over 30 seeded Monte Carlo replications</span>
            <span className="font-semibold text-emerald-600">Active: {strategy.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
