import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import type { Metrics } from '../api/types'

export function AnalyticsPanel({ metrics }: { metrics: Metrics }) {
  const waits = Object.entries(metrics.wait_by_urgency).map(([urgency, value]) => ({
    urgency,
    wait: Number(value.average.toFixed(1)),
    max: Number(value.max.toFixed(1)),
  }))

  const utilizationData = Object.entries(metrics.utilization).map(([unit, value]) => ({
    unit: unit.replace('_', ' '),
    utilization: Math.round(value),
  }))

  const hasData = waits.length > 0 || utilizationData.some(d => d.utilization > 0)

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Throughput & capacity signal</p>
          <h2>Analytics & Performance</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="data-label bg-ward px-2 py-0.5 rounded text-[10px]">
            COMPLETED: {metrics.patients_completed}
          </span>
          <span
            className={`data-label px-2 py-0.5 rounded text-[10px] ${
              metrics.sla_violations > 0 ? 'bg-alarm/10 text-alarm' : 'bg-mint/10 text-mint'
            }`}
          >
            SLA BREACHES: {metrics.sla_violations}
          </span>
        </div>
      </div>

      {hasData ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-3">
          {/* Wait Time Distribution Chart */}
          <div>
            <h3 className="text-xs font-bold text-ink mb-2 flex justify-between">
              <span>Wait time by urgency</span>
              <span className="text-muted font-normal">Average (min)</span>
            </h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waits} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eaf1f0" />
                  <XAxis dataKey="urgency" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis unit="m" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #10262d20',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="wait" fill="#3d8b7a" radius={[4, 4, 0, 0]} name="Avg Wait" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Unit Utilization Chart */}
          <div>
            <h3 className="text-xs font-bold text-ink mb-2 flex justify-between">
              <span>Resource Utilization</span>
              <span className="text-muted font-normal">% in use</span>
            </h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={utilizationData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eaf1f0" />
                  <XAxis dataKey="unit" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis unit="%" domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #10262d20',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="utilization" fill="#ef6b4a" radius={[4, 4, 0, 0]} name="Utilization %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          Analytics trends and distributions appear as events and patient journeys progress.
        </div>
      )}
    </section>
  )
}
