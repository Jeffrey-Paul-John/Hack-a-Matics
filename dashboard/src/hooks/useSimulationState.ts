import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useSimulationStore } from '../store/simulationStore'
export function useSimulationState(){ const setState=useSimulationStore(s=>s.setState); return useQuery({queryKey:['simulation-state'],queryFn:api.state,refetchInterval:2500,retry:false,select:(state)=>{setState(state);return state}}) }
