import { useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import './PageTransition.css'

/**
 * Fast slanted page wipe transition:
 * - Immediate route rendering (zero perceived lag)
 * - Single slanted sheet sweeps off in 0.3s revealing the new page
 * - Skips first render (no load animation)
 * - Respects prefers-reduced-motion
 */
export function PageTransition() {
  const location = useLocation()
  const prefersReduced = useReducedMotion()
  const isFirstRender = useRef(true)
  const prevPathRef = useRef(location.pathname)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  // Skip the very first render so the app appears instantly without intro animation
  if (isFirstRender.current) {
    isFirstRender.current = false
    prevPathRef.current = location.pathname
  } else if (location.pathname !== prevPathRef.current) {
    prevPathRef.current = location.pathname
    setActiveKey(location.pathname)
  }

  if (prefersReduced || !activeKey) {
    return null
  }

  return (
    <motion.div
      key={activeKey}
      className="pageTransitionSheet"
      aria-hidden="true"
      initial={{ x: '0vw', skewX: -9 }}
      animate={{ x: '165vw', skewX: -9 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      onAnimationComplete={() => {
        setActiveKey(null)
      }}
    />
  )
}
