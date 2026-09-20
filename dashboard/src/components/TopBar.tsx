import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Compass, Globe, LogOut, Menu, Search, Sparkles, UserCheck, RefreshCw } from 'lucide-react'
import { SUPPORTED_LANGUAGES, useLanguageStore, useTranslation, type SupportedLanguage } from '../onboarding/i18n'
import { useSimulationStore, type ConnectionStatus } from '../store/simulationStore'
import { useAuth } from '../session'
import { usePageCurtain } from '../curtain'

interface TopBarProps {
  activeTabTitle: string
  isConnected: boolean
  connectionStatus?: ConnectionStatus
  alertCount?: number
  onSearch?: (term: string) => void
  onGuideMe?: () => void
  onOpenWhatIf?: () => void
  showGlobalWhatIf?: boolean
  onOpenMobileMenu?: () => void
}

export function TopBar({
  activeTabTitle,
  isConnected,
  connectionStatus = 'connected',
  alertCount = 0,
  onSearch,
  onGuideMe,
  onOpenWhatIf,
  showGlobalWhatIf = false,
  onOpenMobileMenu,
}: TopBarProps) {
  const { language, setLanguage } = useLanguageStore()
  const { t } = useTranslation()
  const auth = useAuth()
  const curtain = usePageCurtain()

  const isReconnecting = connectionStatus === 'reconnecting'
  const isOffline = connectionStatus === 'disconnected' || !isConnected

  const handleSignOut = () => {
    curtain.cover(() => {
      auth.signOut()
    })
  }

  const navigate = useNavigate()
  const liveState = useSimulationStore(s => s.state)
  const setStoreStrategy = useSimulationStore(s => s.setStrategy)
  const notify = useSimulationStore(s => s.notify)

  const [searchValue, setSearchValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Sync external search handler
  const handleSearchChange = (val: string) => {
    setSearchValue(val)
    onSearch?.(val)
    setIsOpen(val.trim().length > 0)
  }

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Build live search results across Wards, Navigation, Policies, and Queues
  const searchResults = useMemo(() => {
    const q = searchValue.trim().toLowerCase()
    if (!q) return []

    const items: Array<{
      id: string
      category: 'Hospital Wards' | 'System Navigation' | 'Triage Policies' | 'Queued Patients'
      title: string
      subtitle: string
      badge?: string
      badgeTone?: string
      action: () => void
    }> = []

    // 1. Hospital Wards & Units
    const defaultWards = [
      {
        name: 'GENERAL',
        title: 'General Inpatient Ward',
        desc: '14 Beds · 5 Doctors · 10 Nurses · Standard acute admissions',
      },
      {
        name: 'ICU',
        title: 'Intensive Care Unit',
        desc: '5 Critical Care Beds · 3 Doctors · 6 Nurses · Mechanical ventilation',
      },
      {
        name: 'ER',
        title: 'Emergency Department',
        desc: '8 Trauma Beds · 4 Doctors · 8 Nurses · 2 Ambulances · Initial triage',
      },
    ]

    const wardKeys = liveState?.resources ? Object.keys(liveState.resources) : ['ER', 'ICU', 'GENERAL']
    wardKeys.forEach(wKey => {
      const found = defaultWards.find(dw => dw.name.toLowerCase() === wKey.toLowerCase())
      const title = found ? `${wKey} (${found.title})` : `${wKey} Ward`
      const desc = found ? found.desc : `Clinical department with active bed and staffing pools`
      if (
        wKey.toLowerCase().includes(q) ||
        title.toLowerCase().includes(q) ||
        desc.toLowerCase().includes(q)
      ) {
        items.push({
          id: `ward-${wKey}`,
          category: 'Hospital Wards',
          title,
          subtitle: desc,
          badge: 'Unit Map',
          badgeTone: 'bg-blue-100 text-blue-800',
          action: () => {
            navigate('/hospital-map')
            onSearch?.(wKey)
            setIsOpen(false)
          },
        })
      }
    })

    // 2. Navigation Pages
    const pages = [
      { path: '/', title: 'Executive Overview', desc: 'KPIs, trend telemetry curve, unit capacity cards' },
      { path: '/hospital-map', title: 'Hospital Map & Triage Queues', desc: 'Live asset tiles (Beds, Doctors, Nurses) and queue tape' },
      { path: '/simulation-lab', title: 'Simulation Lab', desc: 'Scenario controls, shift stepping, and shock injections' },
      { path: '/policy-testing', title: 'Policy Testing & Benchmarks', desc: 'Monte Carlo 30-shift evaluation and Erlang queue theory' },
      { path: '/alerts', title: 'Alerts & SLA Surveillance', desc: 'Active wait-time breaches and critical backlog review' },
      { path: '/reports', title: 'Audit Reports & Telemetry', desc: 'Download simulation telemetry JSON and CSV audit archives' },
      { path: '/guide', title: 'Clinical Operations Guide', desc: 'Queueing theory, Erlang-B/C formulas, Little\'s Law documentation' },
      { path: '/settings', title: 'System Settings', desc: 'API connectivity, Supabase live sync & Groq model parameters' },
    ]

    pages.forEach(p => {
      if (p.title.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)) {
        items.push({
          id: `nav-${p.path}`,
          category: 'System Navigation',
          title: p.title,
          subtitle: p.desc,
          badge: 'Navigate',
          badgeTone: 'bg-slate-100 text-slate-700',
          action: () => {
            navigate(p.path)
            setIsOpen(false)
          },
        })
      }
    })

    // 3. Triage Policies
    const policies = [
      {
        key: 'resource_aware' as const,
        name: 'Resource Aware Policy',
        desc: 'Balances clinical urgency against real-time downstream unit scarcity',
      },
      {
        key: 'wait_aware' as const,
        name: 'Wait Aware Policy',
        desc: 'Escalates triage ranking proportionally to waiting time to prevent starvation',
      },
      {
        key: 'urgency_only' as const,
        name: 'Urgency Only Policy',
        desc: 'Strict clinical acuity ranking (CRITICAL=100, HIGH=60, MODERATE=30, LOW=10)',
      },
      {
        key: 'mdp_optimal' as const,
        name: 'MDP Optimal Policy',
        desc: 'Markov Decision Process dynamic programming admission optimization',
      },
    ]

    policies.forEach(pol => {
      if (pol.name.toLowerCase().includes(q) || pol.desc.toLowerCase().includes(q)) {
        items.push({
          id: `pol-${pol.key}`,
          category: 'Triage Policies',
          title: pol.name,
          subtitle: pol.desc,
          badge: 'Set Policy',
          badgeTone: 'bg-emerald-100 text-emerald-800',
          action: () => {
            setStoreStrategy(pol.key)
            notify(`Active triage policy switched to ${pol.name}`, 'success')
            navigate('/simulation-lab')
            setIsOpen(false)
          },
        })
      }
    })

    // 4. Queued Patients (if any match)
    if (liveState?.queues) {
      Object.entries(liveState.queues).forEach(([dept, patients]) => {
        patients.forEach(p => {
          if (
            p.id.toLowerCase().includes(q) ||
            p.urgency.toLowerCase().includes(q) ||
            dept.toLowerCase().includes(q)
          ) {
            items.push({
              id: `pt-${p.id}`,
              category: 'Queued Patients',
              title: `Patient ${p.id} (${p.urgency})`,
              subtitle: `${dept} Queue · Score: ${p.score} · Status: ${p.status}`,
              badge: dept,
              badgeTone: p.urgency === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800',
              action: () => {
                navigate('/hospital-map')
                onSearch?.(p.id)
                setIsOpen(false)
              },
            })
          }
        })
      })
    }

    return items
  }, [searchValue, liveState, navigate, onSearch, setStoreStrategy, notify])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
    } else if (e.key === 'Enter' && searchResults.length > 0) {
      e.preventDefault()
      searchResults[0].action()
    }
  }

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
      {/* Breadcrumb Section with data-tour and Mobile Drawer Trigger */}
      <div className="flex items-center gap-2.5">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-1.5 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
            title="Open navigation menu"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>
        )}
        <div data-tour="breadcrumb-nav" className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span className="text-slate-400">PulseGrid</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900 font-bold capitalize">{activeTabTitle}</span>
        </div>
      </div>

      {/* Global Interactive Command Search Bar */}
      <div
        ref={searchRef}
        data-tour="global-search"
        className="relative flex-1 max-w-md hidden md:block"
      >
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-full px-4 py-1.5 text-xs text-slate-500 focus-within:border-slate-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-100 transition-all shadow-xs">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchValue}
            placeholder={t('topbar.searchPlaceholder')}
            onChange={e => handleSearchChange(e.target.value)}
            onFocus={() => { if (searchValue.trim()) setIsOpen(true) }}
            onKeyDown={handleKeyDown}
            className="bg-transparent border-none w-full focus:outline-none text-slate-900 placeholder:text-slate-400 text-xs"
          />
          {searchValue && (
            <button
              onClick={() => { handleSearchChange(''); setIsOpen(false) }}
              className="p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors cursor-pointer"
              title="Clear search"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Interactive Search Dropdown Popover */}
        {isOpen && searchValue.trim() && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50 animate-in fade-in-0 zoom-in-95 duration-100 max-h-[420px] flex flex-col">
            <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold text-slate-500 flex items-center justify-between">
              <span>Search Results ({searchResults.length})</span>
              <span className="text-[10px] text-slate-400">Press Enter to select · Esc to close</span>
            </div>

            <div className="overflow-y-auto p-1.5 divide-y divide-slate-50">
              {searchResults.length > 0 ? (
                searchResults.map(item => (
                  <button
                    key={item.id}
                    onClick={item.action}
                    className="w-full p-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors flex items-start justify-between gap-3 group cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {item.title}
                        </span>
                        {item.badge && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${item.badgeTone || 'bg-slate-100 text-slate-700'}`}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    </div>
                    <span className="text-slate-400 group-hover:text-blue-600 text-xs shrink-0 self-center font-bold">
                      →
                    </span>
                  </button>
                ))
              ) : (
                <div className="py-8 px-4 text-center">
                  <p className="text-xs font-semibold text-slate-700">
                    No matching wards, policies, or alerts found for "{searchValue}"
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Try searching for <span className="font-semibold text-slate-600">General</span>, <span className="font-semibold text-slate-600">ICU</span>, <span className="font-semibold text-slate-600">ER</span>, <span className="font-semibold text-slate-600">Resource Aware</span>, or <span className="font-semibold text-slate-600">Simulation Lab</span>.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Top Right Controls & Status */}
      <div className="flex items-center gap-3">
        {/* Optional Global "What If?" Sandbox Button (rendered only if explicitly requested) */}
        {showGlobalWhatIf && onOpenWhatIf && (
          <button
            onClick={onOpenWhatIf}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 hover:bg-indigo-100 transition-all text-xs font-bold shadow-xs cursor-pointer"
            title="Open 'What If?' Counterfactual Comparison Sandbox"
          >
            <Sparkles size={14} className="text-indigo-600" />
            <span>"What If?" Sandbox</span>
          </button>
        )}

        {/* "Guide Me" Live Onboarding Tour Button */}
        <button
          data-tour="guide-me-btn"
          onClick={onGuideMe}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 hover:bg-blue-100/80 transition-all text-xs font-bold shadow-xs cursor-pointer"
          title={t('topbar.guideMe')}
        >
          <Compass size={14} className="text-blue-600" />
          <span>{t('topbar.guideMe')}</span>
        </button>

        {/* Multilingual Selector with data-tour matching reference screenshot */}
        <div
          data-tour="lang-switcher"
          className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1 text-xs text-slate-700 font-semibold"
        >
          <Globe size={13} className="text-slate-400" />
          <select
            value={language}
            onChange={e => setLanguage(e.target.value as SupportedLanguage)}
            className="bg-transparent border-none text-xs font-bold text-slate-800 cursor-pointer focus:outline-none"
            aria-label="Select language"
          >
            {SUPPORTED_LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.native}
              </option>
            ))}
          </select>
        </div>

        {/* Dynamic Telemetry Status Badge with Reconnection indicator */}
        <div
          data-tour="system-status"
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
            isReconnecting
              ? 'bg-amber-50 text-amber-800 border-amber-300'
              : isOffline
              ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
              : 'bg-slate-50 text-slate-700 border-slate-200'
          }`}
        >
          {isReconnecting ? (
            <>
              <RefreshCw size={11} className="animate-spin text-amber-600" />
              <span>Reconnecting...</span>
            </>
          ) : (
            <>
              <span
                className={`w-2 h-2 rounded-full ${
                  !isOffline ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
              <span className="hidden sm:inline">
                {!isOffline ? t('topbar.calibrated') : 'Backend Unavailable'}
              </span>
            </>
          )}
        </div>

        {/* Alerts Bell with Badge */}
        <div className="relative cursor-pointer p-1.5 rounded-full hover:bg-slate-100 transition-colors">
          <Bell size={17} className="text-slate-600" />
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </div>

        {/* User Account Pill matching reference screenshot */}
        <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center">
            <UserCheck size={14} />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[11px] font-bold text-slate-900 leading-tight">
              {auth.user?.email || t('topbar.clinicalStaff')}
            </span>
            <span className="text-[9px] font-mono text-slate-400">
              {auth.user?.role ? auth.user.role.replace('_', ' ') : t('topbar.surveillance')}
            </span>
          </div>
        </div>

        {/* Exit Icon */}
        <button
          onClick={handleSignOut}
          className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          title="Sign out of PulseGrid"
          aria-label="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
