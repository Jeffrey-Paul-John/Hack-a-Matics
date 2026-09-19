import { useState } from 'react'
import { Activity, Layers } from 'lucide-react'
import type { ResourcePool } from '../api/types'
import { useTranslation } from '../onboarding/i18n'

export function ResourceGrid({
  resources,
}: {
  resources: Record<string, Record<string, ResourcePool>>
}) {
  const [selectedDept, setSelectedDept] = useState<string>('ALL')
  const { t } = useTranslation()

  const departments = Object.keys(resources)

  // Compute aggregate system-wide capacity metrics
  let totalCap = 0
  let totalInUse = 0
  let totalDown = 0

  Object.values(resources).forEach(pools => {
    Object.values(pools).forEach(pool => {
      totalCap += pool.total || 0
      totalInUse += pool.occupied || 0
      totalDown += pool.down || 0
    })
  })

  const totalAvailable = Math.max(0, totalCap - totalInUse - totalDown)
  const systemLoad = totalCap > 0 ? (totalInUse / totalCap) * 100 : 0

  const filteredDepts =
    selectedDept === 'ALL'
      ? departments
      : departments.filter(d => d === selectedDept)

  return (
    <section className="sentinel-card flex flex-col gap-5">
      {/* Header & Capacity Overview Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-slate-700" />
            <span className="eyebrow">{t('resources.subtitle')}</span>
          </div>
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
            {t('resources.title')}
          </h2>
        </div>

        {/* Global Summary Metric Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-50 border border-slate-200/90 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500">{t('overview.occupancyRate')}:</span>
            <span
              className={`font-mono text-xs font-bold ${
                systemLoad > 85 ? 'text-red-600' : systemLoad > 60 ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              {Math.round(systemLoad)}%
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200/90 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500">{t('resources.occupied')}:</span>
            <span className="font-mono text-xs font-bold text-slate-900">{totalInUse}</span>
            <span className="text-slate-300">/</span>
            <span className="font-mono text-xs text-slate-500">{totalCap}</span>
          </div>

          <div className="bg-slate-50 border border-slate-200/90 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500">{t('resources.available')}:</span>
            <span className="font-mono text-xs font-bold text-emerald-600">{totalAvailable}</span>
          </div>

          {totalDown > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="text-[11px] font-semibold text-red-600">{t('resources.down')}:</span>
              <span className="font-mono text-xs font-bold text-red-700">{totalDown}</span>
            </div>
          )}
        </div>
      </div>

      {/* Department Filter Pills & Asset Status Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Dynamic Department Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedDept('ALL')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              selectedDept === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            {t('queue.all')}
          </button>
          {departments.map(dept => (
            <button
              key={dept}
              onClick={() => setSelectedDept(dept)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                selectedDept === dept
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {dept}
            </button>
          ))}
        </div>

        {/* Status Legend */}
        <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block shadow-sm" /> Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block shadow-sm" /> Occupied
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block" /> Offline / Down
          </span>
        </div>
      </div>

      {/* Grid of Resource Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-1">
        {filteredDepts.flatMap(department => {
          const pools = resources[department] || {}
          return Object.entries(pools).map(([kind, pool]) => {
            const load = pool.total ? pool.occupied / pool.total : 0
            const available = pool.available ?? Math.max(0, pool.total - pool.occupied)
            const down = pool.down ?? 0

            // Build individual asset items
            const tiles =
              pool.items && pool.items.length > 0
                ? pool.items
                : [
                    ...Array(pool.occupied).fill({ id: `${kind}-occ`, status: 'OCCUPIED' }),
                    ...Array(down).fill({ id: `${kind}-down`, status: 'OUT_OF_SERVICE' }),
                    ...Array(Math.max(0, pool.total - pool.occupied - down)).fill({
                      id: `${kind}-avail`,
                      status: 'AVAILABLE',
                    }),
                  ]

            const loadPct = Math.round(load * 100)
            const loadColor =
              loadPct > 85 ? 'text-red-600' : loadPct > 60 ? 'text-amber-600' : 'text-emerald-600'
            const barFillColor =
              loadPct > 85 ? 'bg-red-500' : loadPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'

            return (
              <div
                key={`${department}-${kind}`}
                className="bg-white border border-slate-200/90 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
              >
                <div>
                  {/* Card Header: Unit Tag & Load % */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="data-label text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {department}
                    </span>
                    <span className={`font-mono text-xs font-bold ${loadColor}`}>
                      {loadPct}% load
                    </span>
                  </div>

                  {/* Resource Kind Name */}
                  <h3 className="text-sm font-extrabold text-slate-900 capitalize tracking-tight flex items-center gap-1.5">
                    <Activity size={13} className="text-slate-400" />
                    <span>{kind.replace('_', ' ')}</span>
                  </h3>

                  {/* Summary Counts */}
                  <p className="text-xs text-slate-500 mt-1.5">
                    <span className="text-slate-900 font-bold">{pool.occupied}</span> in use ·{' '}
                    <span className="text-emerald-600 font-bold">{available}</span> free
                    {down > 0 && (
                      <>
                        {' '}
                        · <span className="text-red-500 font-bold">{down}</span> down
                      </>
                    )}
                  </p>

                  {/* Utilization Progress Bar */}
                  <div className="track mt-2.5">
                    <div
                      className={`fill ${barFillColor}`}
                      style={{ width: `${Math.min(100, loadPct)}%` }}
                    />
                  </div>
                </div>

                {/* Individual Asset Status Matrix */}
                <div className="mt-3.5 pt-2.5 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1.5 text-[10px] text-slate-400 font-mono">
                    <span>ASSET STATUS</span>
                    <span>{tiles.length} UNITS</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {tiles.map((item, idx) => {
                      let tileColor = 'bg-emerald-500 hover:bg-emerald-600'
                      let label = 'Available'
                      if (item.status === 'OCCUPIED') {
                        tileColor = 'bg-red-500 hover:bg-red-600'
                        label = 'Occupied'
                      } else if (
                        item.status === 'MAINTENANCE' ||
                        item.status === 'OUT_OF_SERVICE'
                      ) {
                        tileColor = 'bg-slate-400 hover:bg-slate-500'
                        label = 'Down / Out of service'
                      }

                      return (
                        <span
                          key={item.id ? `${item.id}-${idx}` : idx}
                          className={`w-3.5 h-3.5 rounded-sm transition-transform hover:scale-125 cursor-default shadow-xs ${tileColor}`}
                          title={`${item.id || kind}: ${label}`}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })
        })}
      </div>
    </section>
  )
}
