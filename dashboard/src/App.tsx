import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  FlaskConical,
  GitFork,
  Info,
  LayoutGrid,
  ShieldAlert,
  ShieldPlus,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api/client'
import type { ComparisonResult, Strategy } from './api/types'
import { useLiveSocket } from './hooks/useLiveSocket'
import { useSimulationState } from './hooks/useSimulationState'
import { useSimulationStore } from './store/simulationStore'
import { Sidebar, type TabKey } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { ExecutiveOverview } from './components/ExecutiveOverview'
import { QueuePanel } from './components/QueuePanel'
import { ResourceGrid } from './components/ResourceGrid'
import { ScenarioControls } from './components/ScenarioControls'
import { StrategyComparison } from './components/StrategyComparison'
import { ValidationPanel } from './components/ValidationPanel'
import { PolicyBenchmarkingPanel } from './components/reports/PolicyBenchmarkingPanel'
import { ChatWidget } from './components/ChatWidget'
import { WhatIfModal } from './components/WhatIfModal'
import { MobileBottomNav } from './components/MobileBottomNav'
import { DownloadTelemetryDropdown } from './components/DownloadTelemetryDropdown'
import { generateAuditZip } from './utils/auditExport'
import { useTour } from './onboarding/useTour'
import { tourRegistry } from './onboarding/tourSteps'
import { useTranslation } from './onboarding/i18n'
import { PageTransition } from './PageTransition'
import { useDuplicateControlsCheck } from './hooks/useDuplicateControlsCheck'
import LoginPage, { SessionSplash } from './pages/Login'
import { sessionPhase, useAuth } from './session'
import { usePageCurtain } from './curtain'

const VALID_TABS: TabKey[] = [
  'overview',
  'hospital-map',
  'simulation-lab',
  'policy-testing',
  'alerts',
  'reports',
  'guide',
  'settings',
]

const TAB_TITLE_KEYS: Record<TabKey, string> = {
  overview: 'nav.overview',
  'hospital-map': 'nav.hospitalMap',
  'simulation-lab': 'nav.simulationLab',
  'policy-testing': 'nav.policyTesting',
  alerts: 'nav.alerts',
  reports: 'nav.reports',
  guide: 'nav.guide',
  settings: 'nav.settings',
}

function Dashboard() {
  const query = useSimulationState()
  useLiveSocket()
  // Dev-only: warn in the console if two visible controls share the same label.
  useDuplicateControlsCheck()
  const live = useSimulationStore(s => s.state)
  const isConnected = useSimulationStore(s => s.isConnected) && !query.isError
  const connectionStatus = useSimulationStore(s => s.connectionStatus)
  const notification = useSimulationStore(s => s.notification)
  const clearNotification = useSimulationStore(s => s.clearNotification)
  const notify = useSimulationStore(s => s.notify)
  const strategy = useSimulationStore(s => s.strategy)
  const setStrategy = useSimulationStore(s => s.setStrategy)
  const [isWhatIfOpen, setIsWhatIfOpen] = useState(false)
  const [comparison, setComparison] = useState<ComparisonResult | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const { startTour, checkTourSeen } = useTour()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const rawPath = location.pathname.replace(/^\//, '') as TabKey
  const activeTab: TabKey = VALID_TABS.includes(rawPath) ? rawPath : 'overview'
  const activeTabTitle = t(TAB_TITLE_KEYS[activeTab] || 'nav.overview')

  const handleSelectTab = (tab: TabKey) => {
    navigate(tab === 'overview' ? '/' : `/${tab}`)
  }

  const state = live ?? query.data

  // Check tour completion and auto-invoke for genuinely new users once DOM mounts
  useEffect(() => {
    if (!state) return
    let timer: number
    void checkTourSeen('new-user-dashboard').then(seen => {
      if (!seen) {
        timer = window.setTimeout(() => {
          startTour('new-user-dashboard')
        }, 1200)
      }
    })
    return () => clearTimeout(timer)
  }, [state])

  const runMonteCarlo = async (force = false) => {
    try {
      setIsComparing(true)
      setCompareError(null)
      const res = await api.compare(force)
      setComparison(res)
      notify('Monte Carlo evaluation complete (30 replications)', 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Monte Carlo evaluation failed'
      setCompareError(msg)
      notify(`Monte Carlo failed: ${msg}`, 'error')
    } finally {
      setIsComparing(false)
    }
  }

  const act = async (work: () => Promise<unknown>, actionName = 'Action') => {
    try {
      await work()
      await query.refetch()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Command failed'
      notify(`${actionName} failed: ${msg}`, 'error')
    }
  }

  const switchStrategy = (next: Strategy) => {
    setStrategy(next)
    void act(() => api.switchStrategy(next), `Switch to ${next.replace('_', ' ')}`)
  }

  const benchmarksQuery = useQuery({
    queryKey: ['benchmarks'],
    queryFn: api.benchmarks,
    staleTime: 60000,
  })

  const handleExportReport = () => {
    if (!state) return
    const reportData = {
      timestamp: new Date().toISOString(),
      simulation_time: state.now,
      metrics: state.metrics,
      queues: state.queues,
      resources: state.resources,
      episodes: state.episodes || state.metrics.completed_episodes || [],
      strategy,
    }
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `medflow-report-${state.now.replace(/[:.]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCsv = async () => {
    if (!state) return
    const { blob, filename } = await generateAuditZip({
      state,
      benchmarks: benchmarksQuery.data,
      sessionId: api.getSessionId(),
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const [isSlowLoad, setIsSlowLoad] = useState(false)

  useEffect(() => {
    if (state) return
    const timer = setTimeout(() => {
      setIsSlowLoad(true)
    }, 3000)
    return () => clearTimeout(timer)
  }, [state])

  if (!state) {
    return (
      <main className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6">
        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-8 max-w-md w-full text-center shadow-float">
          <div className="mx-auto w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-4 font-bold text-sm">
            PG
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            PulseGrid · Clinical Intelligence Desk
          </h1>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            {query.error
              ? `Could not reach backend at ${api.base}. Verify that your backend service is running and CORS is configured.`
              : isSlowLoad
              ? 'Waking up the server… Free-tier hosts sleep after periods of inactivity and may take 30–50 seconds to complete the initial spin-up.'
              : 'Establishing live connection to clinical simulation engine…'}
          </p>

          {isSlowLoad && !query.error && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-[11px] flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span>Cold start in progress — server is booting up.</span>
            </div>
          )}

          <button
            className="w-full mt-6 py-2.5 px-4 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-all shadow-sm disabled:opacity-50"
            disabled={query.isLoading && !query.error}
            onClick={() => void act(() => api.start({ seed: 42, strategy }))}
          >
            {query.isLoading && !query.error ? 'Connecting to Server...' : 'Start Simulation Shift'}
          </button>
        </div>
      </main>
    )
  }

  const alertCount = state.metrics.sla_violations

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      {/* Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        alertCount={alertCount}
        mobileOpen={mobileDrawerOpen}
        onCloseMobile={() => setMobileDrawerOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeTabTitle={activeTabTitle}
          isConnected={isConnected}
          connectionStatus={connectionStatus}
          alertCount={alertCount}
          onSearch={setSearchTerm}
          onOpenMobileMenu={() => setMobileDrawerOpen(true)}
          onGuideMe={() => {
            const tourKey = activeTab in tourRegistry ? activeTab : 'new-user-dashboard'
            startTour(tourKey as keyof typeof tourRegistry)
          }}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto pb-24 md:pb-8">
          {/* Stale Telemetry Warning Banner */}
          {!isConnected && (
            <div className="mb-6 flex items-center justify-between gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs font-semibold animate-pulse">
              <div className="flex items-center gap-2.5">
                <WifiOff size={16} />
                <span>
                  {connectionStatus === 'reconnecting'
                    ? 'Reconnecting to PulseGrid backend engine...'
                    : 'Connection to PulseGrid backend offline. Telemetry is disconnected.'}
                </span>
              </div>
              <button
                onClick={() => void query.refetch()}
                className="text-xs underline hover:text-red-900 font-bold"
              >
                Retry Now
              </button>
            </div>
          )}

          {/* Fast slanted route wipe transition */}
          <PageTransition />

          <Routes>
            {/* ROUTE 1: EXECUTIVE OVERVIEW */}
            <Route
              path="/"
              element={
                <ExecutiveOverview
                  state={state}
                  strategy={strategy}
                  comparison={comparison}
                  isComparing={isComparing}
                  onCompare={() => navigate('/policy-testing')}
                  onRefresh={() => void query.refetch()}
                  onStep={() => void act(api.step, 'Advance Event')}
                  onRun={() => void act(() => api.run(60), 'Fast-Forward 60m')}
                  onExportReport={handleExportReport}
                  onExportCsv={handleExportCsv}
                  onSelectWard={() => handleSelectTab('hospital-map')}
                />
              }
            />
            <Route path="/overview" element={<Navigate to="/" replace />} />

            {/* ROUTE 2: HOSPITAL MAP & QUEUES */}
            <Route
              path="/hospital-map"
              element={
                <div className="flex flex-col gap-6">
                  <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                      {t('pages.hospitalMap.title')}
                    </h1>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {t('pages.hospitalMap.desc')}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <QueuePanel queues={state.queues} />
                    <ResourceGrid resources={state.resources} />
                  </div>
                </div>
              }
            />

            {/* ROUTE 3: SIMULATION LAB */}
            <Route
              path="/simulation-lab"
              element={
                <div className="flex flex-col gap-6">
                  <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                      {t('pages.simLab.title')}
                    </h1>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {t('pages.simLab.desc')}
                    </p>
                  </div>
                  <div className="sentinel-card">
                    <ScenarioControls
                      strategy={strategy}
                      resources={state.resources}
                      onStart={() => void act(() => api.start({ seed: 42, strategy }), 'Start Shift')}
                      onStep={() => void act(api.step, 'Advance Event')}
                      onRun={() => void act(() => api.run(60), 'Fast-Forward 60m')}
                      onCompare={() => navigate('/policy-testing')}
                      onStrategy={switchStrategy}
                      onOpenWhatIf={() => setIsWhatIfOpen(true)}
                      onRefresh={() => void query.refetch()}
                    />
                  </div>
                  <ResourceGrid resources={state.resources} />
                </div>
              }
            />

            {/* ROUTE 4: POLICY TESTING & MONTE CARLO */}
            <Route
              path="/policy-testing"
              element={
                <div className="flex flex-col gap-6">
                  <div data-tour="policy-runner" className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                        {t('pages.policy.title')}
                      </h1>
                      <p className="text-xs text-slate-500 font-medium mt-1">
                        {t('pages.policy.desc')}
                      </p>
                    </div>
                    <button
                      onClick={() => void runMonteCarlo(true)}
                      disabled={isComparing}
                      className="btn-primary"
                    >
                      {isComparing ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                          <span>{t('pages.policy.simulating')}</span>
                        </>
                      ) : (
                        <>
                          <BarChart3 size={14} />
                          <span>{t('pages.policy.runEvaluation')}</span>
                        </>
                      )}
                    </button>
                  </div>
                  <StrategyComparison
                    result={comparison}
                    isLoading={isComparing}
                    error={compareError}
                    onRun={() => void runMonteCarlo(true)}
                  />
                  <ValidationPanel metrics={state.metrics} />
                </div>
              }
            />

            {/* ROUTE 5: ALERTS */}
            <Route
              path="/alerts"
              element={
                <div className="flex flex-col gap-6">
                  <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                      {t('pages.alerts.title')}
                    </h1>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {t('pages.alerts.desc')}
                    </p>
                  </div>
                  <div className="sentinel-card">
                    <div data-tour="alerts-banner" className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 mb-6">
                      <ShieldAlert size={20} className="text-red-600 shrink-0" />
                      <div>
                        <strong className="text-xs">
                          {state.metrics.sla_violations} {t('pages.alerts.breachesDetected')}
                        </strong>
                        <p className="text-[11px] text-red-700 mt-0.5">
                          {t('pages.alerts.advice')}
                        </p>
                      </div>
                    </div>
                    <QueuePanel queues={state.queues} />
                  </div>
                </div>
              }
            />

            {/* ROUTE 6: REPORTS & VALIDATION */}
            <Route
              path="/reports"
              element={
                <div className="flex flex-col gap-6">
                  <div data-tour="reports-export" className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                        {t('pages.reports.title')}
                      </h1>
                      <p className="text-xs text-slate-500 font-medium mt-1">
                        {t('pages.reports.desc')}
                      </p>
                    </div>
                    <DownloadTelemetryDropdown
                      onExportJson={handleExportReport}
                      onExportCsv={handleExportCsv}
                      hasEpisodes={
                        ((state.episodes || state.metrics.completed_episodes)?.length ??
                          state.metrics.patients_completed ??
                          0) > 0
                      }
                    />
                  </div>
                  <ValidationPanel metrics={state.metrics} />
                  <PolicyBenchmarkingPanel />
                  <StrategyComparison
                    result={comparison}
                    isLoading={isComparing}
                    error={compareError}
                    onRun={() => void runMonteCarlo(true)}
                  />
                </div>
              }
            />

            {/* ROUTE 7: GUIDE */}
            <Route
              path="/guide"
              element={
                <div className="flex flex-col gap-6">
                  <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                      {t('pages.guide.title')}
                    </h1>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {t('pages.guide.desc')}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="sentinel-card">
                      <h2 className="text-sm font-bold text-slate-900 mb-2">
                        {t('pages.guide.triagePolicies')}
                      </h2>
                      <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
                        <li>
                          <strong className="text-slate-800">Urgency Only:</strong> Ranks strictly by clinical acuity score (CRITICAL=100, HIGH=60, MODERATE=30, LOW=10).
                        </li>
                        <li>
                          <strong className="text-slate-800">Wait Aware:</strong> Gradually elevates score as waiting time grows to prevent starvation.
                        </li>
                        <li>
                          <strong className="text-slate-800">Resource Aware:</strong> Incorporates real-time asset scarcity to prevent bottlenecking.
                        </li>
                        <li>
                          <strong className="text-slate-800">MDP Optimal:</strong> Uses value-iteration dynamic programming for optimal admission decisions.
                        </li>
                      </ul>
                    </div>
                    <div className="sentinel-card">
                      <h2 className="text-sm font-bold text-slate-900 mb-2">
                        {t('pages.guide.mathValidation')}
                      </h2>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        PulseGrid separates theoretical validation from simulation execution:
                      </p>
                      <ul className="text-xs text-slate-600 mt-2 space-y-1.5 list-disc pl-4">
                        <li>Erlang-C predicts queuing delay probability for stable load.</li>
                        <li>Erlang-B predicts blocking probability for loss systems (ICU).</li>
                        <li>Little's Law ($L = \lambda W$) validates empirical consistency.</li>
                      </ul>
                    </div>
                  </div>

                  {/* Interactive Page Tours Directory */}
                  <div className="sentinel-card">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles size={16} className="text-emerald-500" />
                      <h2 className="text-sm font-bold text-slate-900">
                        Interactive Guided Tours by Page
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">
                      Launch an interactive spotlight walkthrough for any section of PulseGrid:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {[
                        { key: 'new-user-dashboard', path: '/', title: 'Executive Overview', desc: 'KPIs, trend curve, capacity cards' },
                        { key: 'hospital-map', path: '/hospital-map', title: 'Hospital Map', desc: 'Triage queues & unit asset grid' },
                        { key: 'simulation-lab', path: '/simulation-lab', title: 'Simulation Lab', desc: 'Stepping controls & shock injections' },
                        { key: 'policy-testing', path: '/policy-testing', title: 'Policy Testing', desc: 'Monte Carlo evaluation & benchmarks' },
                        { key: 'alerts', path: '/alerts', title: 'Alerts & SLA', desc: 'Breach surveillance & backlog review' },
                        { key: 'reports', path: '/reports', title: 'Audit Reports', desc: 'Telemetry export & queuing validation' },
                        { key: 'settings', path: '/settings', title: 'System Settings', desc: 'API connectivity & config parameters' },
                      ].map(item => (
                        <button
                          key={item.key}
                          onClick={() => {
                            navigate(item.path)
                            setTimeout(() => startTour(item.key as any), 350)
                          }}
                          className="flex flex-col items-start p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100 hover:border-slate-300 transition-all text-left group cursor-pointer"
                        >
                          <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-600 flex items-center justify-between w-full">
                            <span>{item.title}</span>
                            <span className="text-[10px] font-mono text-emerald-600">Start &rarr;</span>
                          </span>
                          <span className="text-[11px] text-slate-500 mt-1">{item.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              }
            />

            {/* ROUTE 8: SETTINGS */}
            <Route
              path="/settings"
              element={
                <div className="flex flex-col gap-6">
                  <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                      {t('pages.settings.title')}
                    </h1>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {t('pages.settings.desc')}
                    </p>
                  </div>
                  <div data-tour="settings-card" className="sentinel-card">
                    <h2 className="text-sm font-bold text-slate-900 mb-3">
                      {t('pages.settings.connectionConfig')}
                    </h2>
                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">{t('pages.settings.apiBase')}</span>
                        <span className="font-mono font-bold text-slate-900">{api.base}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">{t('pages.settings.wsEndpoint')}</span>
                        <span className="font-mono font-bold text-slate-900">{api.base.replace(/^http/, 'ws')}/ws/live</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">{t('pages.settings.backendStatus')}</span>
                        <span className={`font-bold ${isConnected ? 'text-emerald-600' : 'text-red-600'}`}>
                          {isConnected ? t('pages.settings.online') : t('pages.settings.offline')}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">{t('pages.settings.configSource')}</span>
                        <span className="font-mono text-slate-700">config/config.yaml</span>
                      </div>
                    </div>
                  </div>

                  {/* Supabase & AI Intelligence Services Card */}
                  <div className="sentinel-card">
                    <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center justify-between">
                      <span>Cloud Infrastructure & AI Services</span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Supabase Live
                      </span>
                    </h2>
                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">Supabase Cloud Database</span>
                        <span className="font-mono font-bold text-slate-900 truncate max-w-[260px]">
                          https://zditonamkiltynteyodf.supabase.co
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">Synchronized Tables</span>
                        <span className="font-mono text-xs text-slate-700">
                          sessions, snapshots, patients, resources
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">LLM Inference Engine</span>
                        <span className="font-mono font-bold text-indigo-600">
                          Groq (llama-3.3-70b-versatile)
                        </span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-slate-500">Voice Synthesis (TTS)</span>
                        <span className="font-mono font-bold text-emerald-600">
                          Sarvam AI Multilingual Audio
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              }
            />

            {/* Login redirect if already authenticated */}
            <Route path="/login" element={<Navigate to="/" replace />} />

            {/* FALLBACK ROUTE */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {/* Floating MedFlow Clinical Copilot */}
      <ChatWidget />

      {/* "What If?" Counterfactual Simulation Sandbox Modal */}
      <WhatIfModal
        isOpen={isWhatIfOpen}
        onClose={() => setIsWhatIfOpen(false)}
        currentStrategy={strategy}
      />

      {/* Ergonomic Mobile Bottom Navigation for Phones */}
      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onOpenWhatIf={() => setIsWhatIfOpen(true)}
        alertCount={alertCount}
      />

      {/* Global Action Failure / Success Toast Alert - Relocated to top-right to prevent overlapping floating chatbot */}
      {notification && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-20 right-4 sm:right-6 z-50 max-w-sm px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 text-xs font-semibold animate-fadeIn border transition-all ${
            notification.type === 'error'
              ? 'bg-rose-950/95 text-rose-100 border-rose-700/80 shadow-rose-950/30'
              : notification.type === 'success'
              ? 'bg-slate-900/95 text-emerald-300 border-emerald-500/40 shadow-slate-950/40'
              : 'bg-slate-900/95 text-white border-slate-700/80 shadow-slate-950/40'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {notification.type === 'error' ? (
              <AlertCircle size={15} className="text-rose-400 shrink-0" />
            ) : notification.type === 'success' ? (
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
            ) : (
              <Info size={15} className="text-blue-400 shrink-0" />
            )}
            <span className="truncate">{notification.message}</span>
          </div>
          <button
            onClick={clearNotification}
            className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Dismiss notification"
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Root App component acting as the session gate.
 *
 * Directs unauthenticated visitors to LoginPage, displays SessionSplash during
 * token resolution, and unlocks the full clinical Dashboard once authenticated.
 */
export default function App() {
  const auth = useAuth()
  const phase = sessionPhase(auth)
  const { blocking } = usePageCurtain()

  if (phase === 'pending') {
    return <SessionSplash />
  }

  if (phase === 'out' || (phase === 'in' && blocking)) {
    return <LoginPage />
  }

  return <Dashboard />
}

