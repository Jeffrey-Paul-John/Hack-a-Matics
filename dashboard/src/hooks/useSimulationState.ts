import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useSimulationStore } from '../store/simulationStore'

export function useSimulationState() {
  const setState = useSimulationStore(s => s.setState)
  const isConnected = useSimulationStore(s => s.isConnected)

  return useQuery({
    queryKey: ['simulation-state'],
    queryFn: api.state,
    // Automatically poll every 2.5s whenever the WebSocket is disconnected/reconnecting;
    // when WebSocket is connected, push events take over and polling pauses to avoid duplicate traffic.
    refetchInterval: isConnected ? false : 2500,
    retry: false,
    select: (state) => {
      setState(state)
      return state
    },
  })
}
