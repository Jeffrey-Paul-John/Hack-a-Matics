/**
 * controlRegistry.ts
 *
 * A flat registry of every named interactive control that is permanently visible
 * in the MedFlow dashboard (i.e. not conditional on modal state or hover).
 *
 * Each entry specifies:
 *   label  – the human-readable text or aria-label the user sees / a screen-reader hears.
 *   action – a stable identifier for the action that control triggers.
 *            Two controls with BOTH the same label AND the same action are a bug.
 *
 * Guidelines for adding entries:
 *  - Buttons that only appear inside modals should NOT be listed here; they are scoped.
 *  - Icon-only buttons with a `title` attribute use that title as the label.
 *  - Navigation items that navigate to the same page as each other ARE duplicates.
 */

export interface ControlEntry {
  /** Human-visible label (text content, aria-label, or title). */
  label: string
  /** Stable action identifier (camelCase). */
  action: string
  /** Which component renders this control — for maintainability. */
  source: string
}

export const CONTROL_REGISTRY: ControlEntry[] = [
  // Sidebar navigation
  { label: 'Executive Overview',    action: 'navigate:overview',         source: 'Sidebar' },
  { label: 'Hospital Map',          action: 'navigate:hospital-map',     source: 'Sidebar' },
  { label: 'Simulation Lab',        action: 'navigate:simulation-lab',   source: 'Sidebar' },
  { label: 'Policy Testing',        action: 'navigate:policy-testing',   source: 'Sidebar' },
  { label: 'Alerts',                action: 'navigate:alerts',           source: 'Sidebar' },
  { label: 'Reports',               action: 'navigate:reports',          source: 'Sidebar' },
  { label: 'Guide',                 action: 'navigate:guide',            source: 'Sidebar' },
  { label: 'Settings',              action: 'navigate:settings',         source: 'Sidebar' },

  // Mobile bottom navigation (mirrors Sidebar; labels differ deliberately to match viewport)
  { label: 'Overview',              action: 'navigate:overview',         source: 'MobileBottomNav' },
  { label: 'Wards',                 action: 'navigate:hospital-map',     source: 'MobileBottomNav' },
  { label: 'Sim Lab',               action: 'navigate:simulation-lab',   source: 'MobileBottomNav' },
  { label: 'Policy',                action: 'navigate:policy-testing',   source: 'MobileBottomNav' },
  { label: 'Alerts (mobile)',       action: 'navigate:alerts',           source: 'MobileBottomNav' },
  { label: 'What If? (mobile)',     action: 'openWhatIf',                source: 'MobileBottomNav' },

  // Top bar
  { label: 'Guide Me',              action: 'startTour',                 source: 'TopBar' },
  { label: 'Select language',       action: 'switchLanguage',            source: 'TopBar' },
  { label: 'Sign out / reset workspace', action: 'signOut',             source: 'TopBar' },

  // Simulation Lab toolbar (ScenarioControls)
  { label: 'Start Shift',           action: 'sim:start',                 source: 'ScenarioControls' },
  { label: 'Step Event',            action: 'sim:step',                  source: 'ScenarioControls' },
  { label: 'Fast-Forward 60m',      action: 'sim:run60',                 source: 'ScenarioControls' },
  { label: 'Save',                  action: 'sim:save',                  source: 'ScenarioControls' },
  { label: 'Resume',                action: 'sim:resume',                source: 'ScenarioControls' },
  { label: '"What If?" Sandbox',    action: 'openWhatIf',                source: 'ScenarioControls' },
  { label: 'Go to Policy Testing',  action: 'navigate:policy-testing',   source: 'ScenarioControls' },
  { label: 'Allocation strategy',   action: 'switchStrategy',            source: 'ScenarioControls' },
  { label: 'Inject Demand Surge',   action: 'shock:surge',               source: 'ScenarioControls' },
  { label: 'Select resource type for shortage', action: 'shock:selectShortageType', source: 'ScenarioControls' },
  { label: 'Apply (shortage)',      action: 'shock:shortage',            source: 'ScenarioControls' },
  { label: 'Select live asset to fail', action: 'shock:selectAsset',    source: 'ScenarioControls' },
  { label: 'Breakdown',             action: 'shock:failAsset',           source: 'ScenarioControls' },
]

// Duplicate-detection helper

export interface DuplicateEntry {
  label: string
  action: string
  sources: string[]
}

/**
 * Returns entries where both `label` AND `action` are identical across two or more controls.
 *
 * Navigation mirror pairs (Sidebar vs MobileBottomNav) are intentionally excluded:
 * they share the same action but use different labels and are rendered on mutually
 * exclusive viewport breakpoints, so they are never simultaneously visible.
 */
export function findDuplicateControls(
  registry: ControlEntry[] = CONTROL_REGISTRY,
  { allowNavMirrors = true }: { allowNavMirrors?: boolean } = {},
): DuplicateEntry[] {
  const map = new Map<string, ControlEntry[]>()
  for (const entry of registry) {
    const key = `${entry.label}::${entry.action}`
    const group = map.get(key) ?? []
    group.push(entry)
    map.set(key, group)
  }

  const NAV_MIRROR_SOURCES = new Set(['Sidebar', 'MobileBottomNav'])

  const duplicates: DuplicateEntry[] = []
  for (const [key, group] of map.entries()) {
    if (group.length < 2) continue

    if (allowNavMirrors) {
      // All sources are navigation mirror components — intentional, skip
      const allMirror = group.every(e => NAV_MIRROR_SOURCES.has(e.source))
      if (allMirror) continue
    }

    const [label, action] = key.split('::')
    duplicates.push({ label, action, sources: group.map(e => e.source) })
  }

  return duplicates
}
