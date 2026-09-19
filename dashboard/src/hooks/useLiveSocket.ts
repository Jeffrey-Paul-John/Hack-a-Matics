import { useEffect } from 'react'
import { api } from '../api/client'
import { useSimulationStore } from '../store/simulationStore'
import type { SimulationState } from '../api/types'

export function useLiveSocket() {
  const setState = useSimulationStore(s => s.setState)
  const setConnected = useSimulationStore(s => s.setConnected)

  useEffect(() => {
    let socket: WebSocket | undefined
    try {
      socket = new WebSocket(api.base.replace(/^http/, 'ws') + '/ws/live')
      socket.onmessage = event => {
        setState(JSON.parse(event.data) as SimulationState)
        setConnected(true)
      }
      socket.onopen = () => {
        socket?.send('subscribe')
        setConnected(true)
      }
      socket.onclose = () => setConnected(false)
      socket.onerror = () => setConnected(false)
    } catch {
      setConnected(false)
    }
    return () => socket?.close()
  }, [setState, setConnected])
}
