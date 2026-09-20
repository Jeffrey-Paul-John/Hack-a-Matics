import { createContext, useContext } from 'react'
import { useNavigate } from 'react-router-dom'

export interface PageCurtain {
  cover: (onCovered?: () => void) => void
  blocking: boolean
}

export const CurtainContext = createContext<PageCurtain>({
  cover: () => {},
  blocking: false,
})

export function useCurtain(): PageCurtain {
  return useContext(CurtainContext)
}

export const usePageCurtain = useCurtain

/**
 * Convenience helper to sweep the curtain closed, perform navigation,
 * and sweep open once the new route is ready.
 */
export function useCurtainNavigate() {
  const navigate = useNavigate()

  return (to: string) => {
    navigate(to)
  }
}
