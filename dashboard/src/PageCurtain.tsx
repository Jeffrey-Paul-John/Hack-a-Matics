import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { CurtainContext } from './curtain'
import './PageCurtain.css'

export const ANGLE = 9 // skew in degrees
export const SWEEP_IN_S = 0.5
export const SWEEP_OUT_S = 0.62
export const OFFSCREEN = '165vw'
export const MAX_HOLD_MS = 1500

type Phase = 'idle' | 'in' | 'covered' | 'out'

export function PageCurtainProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const prefersReduced = useReducedMotion()

  // If reduced motion is on, start idle; otherwise initial phase is 'out' (sweep off on load)
  const [phase, setPhase] = useState<Phase>(prefersReduced ? 'idle' : 'out')
  const [entryFrom, setEntryFrom] = useState<string>('0vw')

  const recordedPathRef = useRef<string>(location.pathname)
  const onCoveredCallbackRef = useRef<(() => void) | null>(null)

  const cover = useCallback((onCovered?: () => void) => {
    if (prefersReduced) {
      onCovered?.()
      return
    }
    recordedPathRef.current = location.pathname
    onCoveredCallbackRef.current = onCovered ?? null
    setEntryFrom(`-${OFFSCREEN}`)
    setPhase('in')
  }, [location.pathname, prefersReduced])

  // Effect while 'in': fallback timeout if onAnimationComplete dropped
  useEffect(() => {
    if (phase !== 'in') return
    const timer = setTimeout(() => {
      setPhase('covered')
    }, SWEEP_IN_S * 1000 + 400)
    return () => clearTimeout(timer)
  }, [phase])

  // Effect when entering 'covered': trigger pending callback & watch for path change / escape hatch
  useEffect(() => {
    if (phase !== 'covered') return

    // Execute callback if navigation was deferred until covered
    if (onCoveredCallbackRef.current) {
      const cb = onCoveredCallbackRef.current
      onCoveredCallbackRef.current = null
      cb()
    }

    // If path has already changed, transition to 'out' immediately
    if (location.pathname !== recordedPathRef.current) {
      setPhase('out')
      return
    }

    // Escape hatch timeout so the sheet never gets stuck
    const timeout = setTimeout(() => {
      setPhase('out')
    }, MAX_HOLD_MS)

    return () => clearTimeout(timeout)
  }, [phase, location.pathname])

  const handleAnimationComplete = () => {
    if (phase === 'in') {
      setPhase('covered')
    } else if (phase === 'out') {
      setPhase('idle')
    }
  }

  const contextValue = {
    cover,
    blocking: phase === 'in',
  }

  return (
    <CurtainContext.Provider value={contextValue}>
      {children}
      {phase !== 'idle' && !prefersReduced && (
        <motion.div
          className="pageCurtain"
          aria-hidden="true"
          initial={{ x: entryFrom, skewX: -ANGLE }}
          animate={{
            x: phase === 'out' ? OFFSCREEN : '0vw',
            skewX: -ANGLE,
          }}
          transition={{
            duration: phase === 'out' ? SWEEP_OUT_S : SWEEP_IN_S,
            ease: phase === 'out' ? [0.16, 1, 0.3, 1] : [0.4, 0, 0.2, 1],
          }}
          onAnimationComplete={handleAnimationComplete}
        />
      )}
    </CurtainContext.Provider>
  )
}
