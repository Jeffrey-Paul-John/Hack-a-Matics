/**
 * controlRegistry.test.ts
 *
 * Ensures no two permanently-visible controls share the same label AND action.
 *
 * This is a pure data test — no DOM, no browser, no mocks required.
 * Run it with: npx vitest run src/utils/controlRegistry.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  CONTROL_REGISTRY,
  findDuplicateControls,
  type ControlEntry,
} from './controlRegistry'

describe('CONTROL_REGISTRY', () => {
  it('has no two controls with identical label AND action (excluding viewport-exclusive nav mirrors)', () => {
    const duplicates = findDuplicateControls(CONTROL_REGISTRY)

    if (duplicates.length > 0) {
      const report = duplicates
        .map(d => `  label="${d.label}" action="${d.action}" found in: ${d.sources.join(', ')}`)
        .join('\n')
      throw new Error(
        `Found ${duplicates.length} duplicate control(s):\n${report}\n\n` +
          'Fix: either give each control a unique label, a unique action, or ' +
          'annotate it in the registry as an allowNavMirrors source pair.',
      )
    }

    expect(duplicates).toHaveLength(0)
  })

  it('every entry has a non-empty label, action, and source', () => {
    const malformed: ControlEntry[] = CONTROL_REGISTRY.filter(
      e => !e.label.trim() || !e.action.trim() || !e.source.trim(),
    )
    if (malformed.length > 0) {
      throw new Error(
        `Malformed control entries (empty label/action/source):\n` +
          JSON.stringify(malformed, null, 2),
      )
    }
    expect(malformed).toHaveLength(0)
  })

  it('action identifiers follow the expected namespace pattern', () => {
    const VALID_PREFIXES = [
      'navigate:',
      'sim:',
      'shock:',
      'openWhatIf',
      'startTour',
      'switchLanguage',
      'switchStrategy',
      'signOut',
    ]
    const invalid = CONTROL_REGISTRY.filter(
      e => !VALID_PREFIXES.some(prefix => e.action.startsWith(prefix)),
    )
    if (invalid.length > 0) {
      throw new Error(
        'Control entries with unrecognized action namespaces:\n' +
          invalid.map(e => `  action="${e.action}" in ${e.source}`).join('\n') +
          '\n\nAdd the new prefix to VALID_PREFIXES in this test.',
      )
    }
    expect(invalid).toHaveLength(0)
  })

  it('the "Go to Policy Testing" control does not share an action with the Sidebar nav (different source is OK; duplicate source would be a bug)', () => {
    // This specific pair was previously a duplicate entry point — guard against regression.
    const policyEntries = CONTROL_REGISTRY.filter(
      e => e.action === 'navigate:policy-testing',
    )
    const sources = policyEntries.map(e => e.source)
    const uniqueSources = new Set(sources)

    // Each source should appear at most once for this action
    const duplicatedSources = sources.filter(
      (src, idx) => sources.indexOf(src) !== idx,
    )
    if (duplicatedSources.length > 0) {
      throw new Error(
        `The "navigate:policy-testing" action is registered more than once in the same source: ` +
          duplicatedSources.join(', ') +
          '\nThis indicates a duplicate entry point that was previously removed.',
      )
    }
    expect(uniqueSources.size).toBe(policyEntries.length)
  })

  it('openWhatIf is registered in at most two sources (ScenarioControls + MobileBottomNav)', () => {
    // The header "What If?" button was previously a duplicate and was removed.
    // If a third instance appears, it must be intentional and reviewed.
    const entries = CONTROL_REGISTRY.filter(e => e.action === 'openWhatIf')
    const ALLOWED_SOURCES = new Set(['ScenarioControls', 'MobileBottomNav', 'TopBar'])
    const unexpected = entries.filter(e => !ALLOWED_SOURCES.has(e.source))
    expect(unexpected).toHaveLength(0)

    // Regression: TopBar should NOT have a visible openWhatIf unless showGlobalWhatIf is explicit
    const topBarEntry = entries.find(e => e.source === 'TopBar')
    expect(topBarEntry).toBeUndefined()
  })
})
