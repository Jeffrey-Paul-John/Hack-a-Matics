import { Bell, Compass, Globe, LogOut, Search, UserCheck } from 'lucide-react'
import { SUPPORTED_LANGUAGES, useLanguageStore, useTranslation, type SupportedLanguage } from '../onboarding/i18n'

interface TopBarProps {
  activeTabTitle: string
  isConnected: boolean
  alertCount?: number
  onSearch?: (term: string) => void
  onGuideMe?: () => void
}

export function TopBar({
  activeTabTitle,
  isConnected,
  alertCount = 0,
  onSearch,
  onGuideMe,
}: TopBarProps) {
  const { language, setLanguage } = useLanguageStore()
  const { t } = useTranslation()

  return (
    <header className="h-16 bg-white border-b border-[#e2e8f0] px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className="text-slate-400">MEDFLOW</span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-bold capitalize">{activeTabTitle}</span>
      </div>

      {/* Global Search Bar with data-tour */}
      <div
        data-tour="global-search"
        className="flex-1 max-w-md hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-full px-4 py-1.5 text-xs text-slate-500 focus-within:border-slate-400 focus-within:bg-white transition-all"
      >
        <Search size={14} className="text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder={t('topbar.searchPlaceholder')}
          onChange={e => onSearch?.(e.target.value)}
          className="bg-transparent border-none w-full focus:outline-none text-slate-900 placeholder:text-slate-400 text-xs"
        />
      </div>

      {/* Top Right Controls & Status */}
      <div className="flex items-center gap-3">
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

        {/* System Calibrated Status Badge with data-tour */}
        <div
          data-tour="system-status"
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
            isConnected
              ? 'bg-slate-50 text-slate-700 border-slate-200'
              : 'bg-red-50 text-red-700 border-red-200 animate-pulse'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
          <span className="hidden sm:inline">
            {isConnected ? t('topbar.calibrated') : t('topbar.disconnected')}
          </span>
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
            <span className="text-[11px] font-bold text-slate-900 leading-tight">{t('topbar.clinicalStaff')}</span>
            <span className="text-[9px] font-mono text-slate-400">{t('topbar.surveillance')}</span>
          </div>
        </div>

        {/* Exit Icon */}
        <button
          className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          title="Sign out / reset workspace"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
