import { useState } from 'react'
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  FlaskConical,
  GitFork,
  LayoutGrid,
  Settings,
} from 'lucide-react'
import { useTranslation } from '../onboarding/i18n'

export type TabKey =
  | 'overview'
  | 'hospital-map'
  | 'simulation-lab'
  | 'policy-testing'
  | 'alerts'
  | 'reports'
  | 'guide'
  | 'settings'

interface SidebarProps {
  activeTab: TabKey
  onSelectTab: (tab: TabKey) => void
  alertCount?: number
}

export function Sidebar({ activeTab, onSelectTab, alertCount = 0 }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { t } = useTranslation()

  return (
    <aside
      className={`hidden md:flex flex-col bg-white border-r border-[#e2e8f0] h-screen sticky top-0 justify-between transition-all duration-300 z-30 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="p-4 flex flex-col h-full overflow-y-auto">
        {/* Brand Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3 overflow-hidden">
            {/* Logo Badge */}
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
              PG
            </div>
            {!collapsed && (
              <div className="leading-tight truncate">
                <div className="font-extrabold text-sm tracking-tight text-slate-900">
                  PULSEGRID
                </div>
                <div className="text-[10px] font-bold text-slate-400 tracking-wider">
                  CLINICAL INTELLIGENCE
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* Navigation Sections */}
        <nav data-tour="sidebar-nav" className="mt-6 flex flex-col gap-6 flex-1">
          {/* Section: MONITORING */}
          <div>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('nav.monitoring')}
              </p>
            )}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => onSelectTab('overview')}
                className={`nav-item w-full ${activeTab === 'overview' ? 'active' : ''}`}
                title={t('nav.overview')}
              >
                <LayoutGrid size={17} className="shrink-0" />
                {!collapsed && <span>{t('nav.overview')}</span>}
              </button>

              <button
                onClick={() => onSelectTab('hospital-map')}
                className={`nav-item w-full ${activeTab === 'hospital-map' ? 'active' : ''}`}
                title={t('nav.hospitalMap')}
              >
                <GitFork size={17} className="shrink-0" />
                {!collapsed && <span>{t('nav.hospitalMap')}</span>}
              </button>
            </div>
          </div>

          {/* Section: ANALYSIS */}
          <div>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('nav.analysis')}
              </p>
            )}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => onSelectTab('simulation-lab')}
                className={`nav-item w-full ${activeTab === 'simulation-lab' ? 'active' : ''}`}
                title={t('nav.simulationLab')}
              >
                <FlaskConical size={17} className="shrink-0" />
                {!collapsed && <span>{t('nav.simulationLab')}</span>}
              </button>

              <button
                onClick={() => onSelectTab('policy-testing')}
                className={`nav-item w-full ${activeTab === 'policy-testing' ? 'active' : ''}`}
                title={t('nav.policyTesting')}
              >
                <BarChart3 size={17} className="shrink-0" />
                {!collapsed && <span>{t('nav.policyTesting')}</span>}
              </button>
            </div>
          </div>

          {/* Section: OPERATIONS */}
          <div>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('nav.operations')}
              </p>
            )}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => onSelectTab('alerts')}
                className={`nav-item w-full justify-between ${activeTab === 'alerts' ? 'active' : ''}`}
                title={t('nav.alerts')}
              >
                <div className="flex items-center gap-3 truncate">
                  <Bell size={17} className="shrink-0" />
                  {!collapsed && <span>{t('nav.alerts')}</span>}
                </div>
                {!collapsed && alertCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {alertCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => onSelectTab('reports')}
                className={`nav-item w-full ${activeTab === 'reports' ? 'active' : ''}`}
                title={t('nav.reports')}
              >
                <FileText size={17} className="shrink-0" />
                {!collapsed && <span>{t('nav.reports')}</span>}
              </button>
            </div>
          </div>

          {/* Section: SYSTEM */}
          <div>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('nav.system')}
              </p>
            )}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => onSelectTab('guide')}
                className={`nav-item w-full ${activeTab === 'guide' ? 'active' : ''}`}
                title={t('nav.guide')}
              >
                <BookOpen size={17} className="shrink-0" />
                {!collapsed && <span>{t('nav.guide')}</span>}
              </button>

              <button
                onClick={() => onSelectTab('settings')}
                className={`nav-item w-full ${activeTab === 'settings' ? 'active' : ''}`}
                title={t('nav.settings')}
              >
                <Settings size={17} className="shrink-0" />
                {!collapsed && <span>{t('nav.settings')}</span>}
              </button>
            </div>
          </div>
        </nav>
      </div>
    </aside>
  )
}
