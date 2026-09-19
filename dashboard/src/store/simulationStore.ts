import { create } from 'zustand'
import type { SimulationState, Strategy } from '../api/types'

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'

export interface NotificationToast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

type Store = {
  state: SimulationState | null
  strategy: Strategy
  isConnected: boolean
  connectionStatus: ConnectionStatus
  notification: NotificationToast | null
  setState: (state: SimulationState) => void
  setStrategy: (strategy: Strategy) => void
  setConnected: (status: boolean) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  clearNotification: () => void
}

let notificationTimer: ReturnType<typeof setTimeout> | null = null

export const useSimulationStore = create<Store>((set, get) => ({
  state: null,
  strategy: 'resource_aware',
  isConnected: false,
  connectionStatus: 'disconnected',
  notification: null,
  setState: state => set({ state, isConnected: true, connectionStatus: 'connected' }),
  setStrategy: strategy => set({ strategy }),
  setConnected: isConnected => set({
    isConnected,
    connectionStatus: isConnected ? 'connected' : 'disconnected',
  }),
  setConnectionStatus: connectionStatus => set({
    connectionStatus,
    isConnected: connectionStatus === 'connected',
  }),
  notify: (message, type = 'info') => {
    if (notificationTimer) clearTimeout(notificationTimer)
    const toast: NotificationToast = { id: String(Date.now()), message, type }
    set({ notification: toast })
    notificationTimer = setTimeout(() => {
      if (get().notification?.id === toast.id) {
        set({ notification: null })
      }
    }, 4000)
  },
  clearNotification: () => {
    if (notificationTimer) clearTimeout(notificationTimer)
    set({ notification: null })
  },
}))

