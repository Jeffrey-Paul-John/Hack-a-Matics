import { useRef } from 'react'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { api } from '../api/client'
import { useTranslation } from './i18n'
import { tourRegistry } from './tourSteps'

export function useTour() {
  const { t } = useTranslation()
  const activeDriverRef = useRef<Driver | null>(null)

  const markTourSeen = async (tourId: string) => {
    try {
      localStorage.setItem(`medflow-tour-completed-${tourId}`, 'true')
      await api.completeOnboarding(tourId)
    } catch {
      // LocalStorage already saved as offline fallback
    }
  }

  const checkTourSeen = async (tourId: string): Promise<boolean> => {
    // Check localStorage first
    if (localStorage.getItem(`medflow-tour-completed-${tourId}`) === 'true') {
      return true
    }
    // Check backend state
    try {
      const res = await api.getOnboardingStatus(tourId)
      if (res.completed) {
        localStorage.setItem(`medflow-tour-completed-${tourId}`, 'true')
        return true
      }
    } catch {
      /* Backend offline, rely on localStorage */
    }
    return false
  }

  const startTour = (tourId: keyof typeof tourRegistry = 'new-user-dashboard') => {
    try {
      const rawSteps = tourRegistry[tourId]
      if (!rawSteps || rawSteps.length === 0) return

      // Filter steps to those currently present in DOM to prevent crashes
      const validSteps = rawSteps.filter(s => {
        const el = document.querySelector(s.target)
        if (!el) {
          console.warn(`[Tour Engine] Target element for step '${s.id}' (${s.target}) was not found in active DOM. Skipping.`)
          return false
        }
        return true
      })

      if (validSteps.length === 0) {
        console.warn(`[Tour Engine] No active DOM elements matched for tour '${tourId}'.`)
        return
      }

      if (activeDriverRef.current) {
        activeDriverRef.current.destroy()
      }

      const totalSteps = validSteps.length

      const driverObj = driver({
        showProgress: true,
        progressText: '{{current}} / {{total}}',
        nextBtnText: t('onboarding.next'),
        prevBtnText: t('onboarding.previous'),
        doneBtnText: t('onboarding.done'),
        allowClose: true,
        overlayColor: 'rgba(15, 23, 42, 0.75)',
        stagePadding: 8,
        stageRadius: 10,
        popoverClass: 'medflow-tour-popover',
        onPopoverRender: (popover, { state }) => {
          // Add custom robot assistant badge and dynamic progress bar matching reference screenshot
          const activeIndex = state.activeIndex ?? 0
          const progressPercent = Math.min(100, Math.round(((activeIndex + 1) / totalSteps) * 100))

          // Inject circular assistant bot badge if not present
          if (!popover.wrapper.querySelector('.medflow-tour-bot-badge')) {
            const badge = document.createElement('div')
            badge.className = 'medflow-tour-bot-badge'
            badge.innerHTML = `
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 8V4H8"></path>
                <rect width="16" height="12" x="4" y="8" rx="2"></rect>
                <path d="M2 14h2"></path>
                <path d="M20 14h2"></path>
                <path d="M15 13v2"></path>
                <path d="M9 13v2"></path>
              </svg>
            `
            popover.wrapper.prepend(badge)
          }

          // Inject or update styled progress bar
          let bar = popover.wrapper.querySelector('.medflow-tour-progress-bar') as HTMLElement
          if (!bar) {
            bar = document.createElement('div')
            bar.className = 'medflow-tour-progress-bar'
            const footer = popover.wrapper.querySelector('.driver-popover-footer')
            if (footer) {
              footer.parentNode?.insertBefore(bar, footer)
            }
          }
          if (bar) {
            bar.style.setProperty('--tour-progress', `${progressPercent}%`)
          }
        },
        steps: validSteps.map(s => ({
          element: s.target,
          popover: {
            title: t(s.titleKey),
            description: t(s.descriptionKey),
            side: s.side ?? 'bottom',
            align: 'start',
          },
        })),
        onDestroyed: () => {
          void markTourSeen(tourId)
          activeDriverRef.current = null
        },
      })

      activeDriverRef.current = driverObj
      driverObj.drive()
    } catch (err) {
      console.error('[Tour Engine] Failed to start onboarding tour:', err)
    }
  }

  return { startTour, checkTourSeen, markTourSeen }
}
