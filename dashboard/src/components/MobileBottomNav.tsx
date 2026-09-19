import {
  BarChart3,
  Bell,
  FlaskConical,
  GitFork,
  LayoutGrid,
  Sparkles,
} from 'lucide-react'
import type { TabKey } from './Sidebar'

interface MobileBottomNavProps {
  activeTab: TabKey
  onSelectTab: (tab: TabKey) => void
  onOpenWhatIf?: () => void
  alertCount?: number
}

export function MobileBottomNav({
  activeTab,
  onSelectTab,
  onOpenWhatIf,
  alertCount = 0,
}: MobileBottomNavProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around shadow-lg">
      {/* 1. Overview */}
      <button
        onClick={() => onSelectTab('overview')}
        className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2 rounded-xl transition-all ${
          activeTab === 'overview'
            ? 'text-slate-900 font-bold bg-slate-100'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <LayoutGrid size={19} />
        <span className="text-[10px] mt-0.5 font-medium tracking-tight">Overview</span>
      </button>

      {/* 2. Wards / Map */}
      <button
        onClick={() => onSelectTab('hospital-map')}
        className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2 rounded-xl transition-all ${
          activeTab === 'hospital-map'
            ? 'text-slate-900 font-bold bg-slate-100'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <GitFork size={19} />
        <span className="text-[10px] mt-0.5 font-medium tracking-tight">Wards</span>
      </button>

      {/* 3. Central "What If" Floating Action */}
      {onOpenWhatIf && (
        <button
          onClick={onOpenWhatIf}
          className="flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white font-bold shadow-md active:scale-95 transition-all -mt-3 border-2 border-white"
          title="Open 'What If?' comparison"
        >
          <Sparkles size={18} />
          <span className="text-[9px] mt-0.5 uppercase tracking-wider font-extrabold">What If?</span>
        </button>
      )}

      {/* 4. Sim Lab */}
      <button
        onClick={() => onSelectTab('simulation-lab')}
        className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2 rounded-xl transition-all ${
          activeTab === 'simulation-lab'
            ? 'text-slate-900 font-bold bg-slate-100'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <FlaskConical size={19} />
        <span className="text-[10px] mt-0.5 font-medium tracking-tight">Sim Lab</span>
      </button>

      {/* 5. Policy Testing */}
      <button
        onClick={() => onSelectTab('policy-testing')}
        className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2 rounded-xl transition-all ${
          activeTab === 'policy-testing'
            ? 'text-slate-900 font-bold bg-slate-100'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <BarChart3 size={19} />
        <span className="text-[10px] mt-0.5 font-medium tracking-tight">Policy</span>
      </button>

      {/* 6. Alerts */}
      <button
        onClick={() => onSelectTab('alerts')}
        className={`relative flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2 rounded-xl transition-all ${
          activeTab === 'alerts'
            ? 'text-slate-900 font-bold bg-slate-100'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <Bell size={19} />
        <span className="text-[10px] mt-0.5 font-medium tracking-tight">Alerts</span>
        {alertCount > 0 && (
          <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {alertCount > 9 ? '9+' : alertCount}
          </span>
        )}
      </button>
    </nav>
  )
}
