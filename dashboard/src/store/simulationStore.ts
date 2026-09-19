import { create } from 'zustand'
import type { SimulationState, Strategy } from '../api/types'

type Store = {
  state: SimulationState | null
  strategy: Strategy
  isConnected: boolean
  setState: (state: SimulationState) => void
  setStrategy: (strategy: Strategy) => void
  setConnected: (status: boolean) => void
}

export const useSimulationStore = create<Store>(set => ({
  state: null,
  strategy: 'resource_aware',
  isConnected: true,
  setState: state => set({ state, isConnected: true }),
  setStrategy: strategy => set({ strategy }),
  setConnected: isConnected => set({ isConnected }),
}))
