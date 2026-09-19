import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { Download, ChevronDown, FileJson, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { useSimulationStore } from '../store/simulationStore'

interface DownloadTelemetryDropdownProps {
  onExportJson: () => void
  onExportCsv: () => Promise<void> | void
  hasEpisodes: boolean
  isExporting?: boolean
  label?: string
  className?: string
}

export function DownloadTelemetryDropdown({
  onExportJson,
  onExportCsv,
  hasEpisodes,
  isExporting = false,
  label = 'Download Telemetry',
  className = '',
}: DownloadTelemetryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const notify = useSimulationStore(s => s.notify)

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement | HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
      } else {
        const menuItems = menuRef.current?.querySelectorAll<HTMLButtonElement>(
          'button:not([disabled])'
        )
        if (menuItems && menuItems.length > 0) {
          menuItems[0].focus()
        }
      }
    }
  }

  const handleJsonClick = () => {
    setIsOpen(false)
    try {
      onExportJson()
      notify('Telemetry JSON (full) exported successfully', 'success')
    } catch {
      notify('Failed to export JSON report', 'error')
    }
  }

  const handleCsvClick = async () => {
    if (!hasEpisodes) return
    setIsOpen(false)
    try {
      await onExportCsv()
      notify('Audit CSV bundle (analysis) exported successfully (.zip)', 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed'
      notify(`Failed to export CSV bundle: ${msg}`, 'error')
    }
  }

  return (
    <div className="relative inline-block text-left" ref={dropdownRef} onKeyDown={handleKeyDown}>
      {/* Split / Unified Accessible Trigger Button */}
      <div className="inline-flex rounded-xl shadow-sm">
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          aria-label={`${label} menu`}
          disabled={isExporting}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 cursor-pointer disabled:opacity-50 ${className}`}
        >
          <Download size={14} className="shrink-0" />
          <span>{label}</span>
          <ChevronDown
            size={13}
            className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Accessible Dropdown Menu */}
      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl bg-white border border-slate-200 shadow-xl py-1 z-30 focus:outline-none animate-fadeIn"
        >
          {/* Option 1: JSON (full) */}
          <button
            type="button"
            role="menuitem"
            tabIndex={0}
            onClick={handleJsonClick}
            className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors focus:bg-slate-100 focus:outline-none cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
              <FileJson size={15} />
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-900">
                JSON (full)
              </span>
              <span className="block text-[10px] text-slate-500 mt-0.5 leading-snug">
                Full-fidelity raw state, queue buffers, and resource telemetry.
              </span>
            </div>
          </button>

          <div className="border-t border-slate-100 my-1" />

          {/* Option 2: CSV (analysis) */}
          <div className="relative group">
            <button
              type="button"
              role="menuitem"
              tabIndex={hasEpisodes ? 0 : -1}
              disabled={!hasEpisodes || isExporting}
              onClick={handleCsvClick}
              className={`w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors focus:outline-none ${
                hasEpisodes
                  ? 'hover:bg-slate-50 focus:bg-slate-100 cursor-pointer'
                  : 'opacity-50 cursor-not-allowed bg-slate-50/50'
              }`}
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                <FileSpreadsheet size={15} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="block text-xs font-bold text-slate-900">
                    CSV (analysis)
                  </span>
                  {!hasEpisodes && (
                    <span className="text-[9px] font-mono text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded">
                      0 episodes
                    </span>
                  )}
                </div>
                <span className="block text-[10px] text-slate-500 mt-0.5 leading-snug">
                  Excel/R/Python bundle: episodes.csv, benchmarks.csv, run_metadata.csv.
                </span>
              </div>
            </button>

            {/* Empty state tooltip when disabled */}
            {!hasEpisodes && (
              <div className="hidden group-hover:flex absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-slate-900 text-white text-[10px] rounded-lg shadow-lg items-center gap-1.5 z-40">
                <AlertCircle size={12} className="text-amber-400 shrink-0" />
                <span>Advance the simulation to complete episodes before exporting CSV analysis.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
