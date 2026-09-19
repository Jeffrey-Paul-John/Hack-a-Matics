import { useState } from 'react'
import { Clock, Search, User, Users } from 'lucide-react'
import type { QueuePatient } from '../api/types'
import { useTranslation } from '../onboarding/i18n'

const tone: Record<string, string> = {
  CRITICAL: 'bg-red-500 text-white font-bold',
  HIGH: 'bg-amber-500 text-white font-bold',
  MODERATE: 'bg-amber-100 text-amber-900 border border-amber-300 font-semibold',
  LOW: 'bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold',
}

export function QueuePanel({ queues }: { queues: Record<string, QueuePatient[]> }) {
  const [filterText, setFilterText] = useState('')
  const [acuityFilter, setAcuityFilter] = useState<string>('ALL')
  const { t } = useTranslation()

  const allRows = Object.entries(queues)
    .flatMap(([department, patients]) => patients.map(patient => ({ department, ...patient })))
    .sort((a, b) => b.score - a.score)

  const rows = allRows.filter(row => {
    const matchesSearch =
      filterText === '' ||
      row.id.toLowerCase().includes(filterText.toLowerCase()) ||
      row.department.toLowerCase().includes(filterText.toLowerCase())

    const matchesAcuity = acuityFilter === 'ALL' || row.urgency === acuityFilter
    return matchesSearch && matchesAcuity
  })

  const acuities = Array.from(new Set(allRows.map(r => r.urgency)))

  return (
    <section className="sentinel-card flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-slate-700" />
            <span className="eyebrow">{t('queue.eyebrow')}</span>
          </div>
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
            {t('queue.title')}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="data-label text-slate-800 font-mono font-bold">
            {allRows.length}{' '}
            {allRows.length === 1 ? t('queue.patientWaiting') : t('queue.patientsWaiting')}
          </span>
        </div>
      </div>

      {/* Search & Acuity Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('queue.filterPlaceholder')}
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none"
          />
        </div>

        {acuities.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAcuityFilter('ALL')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                acuityFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({allRows.length})
            </button>
            {acuities.map(acuity => {
              const count = allRows.filter(r => r.urgency === acuity).length
              return (
                <button
                  key={acuity}
                  onClick={() => setAcuityFilter(acuity)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                    acuityFilter === acuity
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {acuity} ({count})
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Queue Table */}
      {rows.length > 0 ? (
        <div className="overflow-x-auto max-h-[460px] overflow-y-auto border border-slate-100 rounded-xl">
          <table className="sentinel-table">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr>
                <th>Patient ID</th>
                <th>Target Unit</th>
                <th>Clinical Acuity</th>
                <th>Wait Duration</th>
                <th className="text-right">Priority Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>
                    <div className="flex items-center gap-2 font-mono font-semibold text-slate-900">
                      <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                        <User size={12} />
                      </span>
                      <span>{row.id}</span>
                    </div>
                  </td>
                  <td>
                    <span className="inline-block px-2 py-0.5 text-xs bg-slate-100 text-slate-800 rounded font-mono font-bold">
                      {row.department}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`status-pill px-2.5 py-1 rounded-md text-[10px] ${
                        tone[row.urgency] || 'bg-slate-200 text-slate-800'
                      }`}
                    >
                      {row.urgency}
                    </span>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-slate-600">
                      <Clock size={13} className="text-slate-400" />
                      {row.wait_minutes != null ? `${row.wait_minutes} min` : '0.0 min'}
                    </span>
                  </td>
                  <td className="text-right font-mono font-bold text-slate-900 text-sm">
                    {row.score.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs">
          No patients are currently waiting in this queue view. Advance the simulation or inject a demand surge to generate admissions.
        </div>
      )}
    </section>
  )
}
