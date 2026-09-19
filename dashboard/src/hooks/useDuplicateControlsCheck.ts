/**
 * useDuplicateControlsCheck.ts
 *
 * Development-only hook that scans the live DOM after each render and warns in
 * the browser console when two VISIBLE interactive elements share both the same
 * accessible label AND the same `title` or `aria-label` value.
 *
 * This is a runtime complement to the static controlRegistry.test.ts: it catches
 * dynamic cases (controls conditionally rendered, modal buttons that become visible,
 * etc.) that the static registry might miss.
 *
 * The hook is a no-op in production builds (import.meta.env.DEV === false).
 */

import { useEffect } from 'react'

/** Selectors for interactive controls we care about. */
const INTERACTIVE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input[type="submit"]:not([disabled])',
  'input[type="button"]:not([disabled])',
  '[role="button"]:not([disabled])',
].join(', ')

/** Derive the visible label for an element using standard priority order. */
function getLabel(el: Element): string {
  return (
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    (el as HTMLElement).innerText?.trim() ||
    ''
  ).replace(/\s+/g, ' ')
}

/** Check if an element is actually visible in the viewport / layout. */
function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false
  }
  const rect = (el as HTMLElement).getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

interface DuplicateWarning {
  label: string
  count: number
  elements: Element[]
}

export function useDuplicateControlsCheck(
  /** Pass false to disable even in dev (e.g. during heavy animation). */
  enabled = true,
) {
  useEffect(() => {
    if (!import.meta.env.DEV || !enabled) return

    // Debounce so we don't fire during rapid state churn
    const timer = window.setTimeout(() => {
      const all = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR)).filter(isVisible)

      // Group by label
      const byLabel = new Map<string, Element[]>()
      for (const el of all) {
        const label = getLabel(el)
        if (!label) continue
        const group = byLabel.get(label) ?? []
        group.push(el)
        byLabel.set(label, group)
      }

      const warnings: DuplicateWarning[] = []
      for (const [label, els] of byLabel.entries()) {
        if (els.length < 2) continue

        // Only warn when multiple elements have the same label AND the same `onclick`
        // signature cannot be verified statically, so we fall back to warning whenever
        // the label alone repeats — the developer can dismiss if intentional.
        warnings.push({ label, count: els.length, elements: els })
      }

      if (warnings.length > 0) {
        console.group(
          '%c[MedFlow] ⚠ Duplicate visible controls detected',
          'color: #f59e0b; font-weight: bold;',
        )
        for (const w of warnings) {
          console.warn(
            `  Label "${w.label}" appears ${w.count} times on screen:`,
            w.elements,
          )
        }
        console.groupEnd()
      }
    }, 600)

    return () => clearTimeout(timer)
  })
}
