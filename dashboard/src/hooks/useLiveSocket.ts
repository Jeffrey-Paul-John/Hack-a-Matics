import { useEffect, useRef } from 'react'
import { api } from '../api/client'
import { useSimulationStore } from '../store/simulationStore'
import type { SimulationState } from '../api/types'

export function useLiveSocket() {
  const setState = useSimulationStore(s => s.setState)
  const setConnectionStatus = useSimulationStore(s => s.setConnectionStatus)
  const notify = useSimulationStore(s => s.notify)

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryCountRef = useRef(0)
  const isUnmountingRef = useRef(false)

  useEffect(() => {
    isUnmountingRef.current = false

    // Initial state fetch to immediately populate UI even before WS connects
    api.state().then(state => {
      setState(state)
    }).catch(() => {
      // Backend not yet reachable
      setConnectionStatus('disconnected')
    })

    function connect() {
      if (isUnmountingRef.current) return

      const sessionId = api.getSessionId()
      const wsUrl = `${api.getWsUrl('/ws/live')}?session_id=${encodeURIComponent(sessionId)}`

      if (retryCountRef.current > 0) {
        setConnectionStatus('reconnecting')
      }

      try {
        const socket = new WebSocket(wsUrl)
        socketRef.current = socket

        socket.onopen = () => {
          if (isUnmountingRef.current) {
            socket.close()
            return
          }
          retryCountRef.current = 0
          setConnectionStatus('connected')
          socket.send('subscribe')

          // Start ping heartbeat every 15 seconds
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
          pingIntervalRef.current = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              try {
                socket.send('ping')
              } catch {
                // Ignore ping error
              }
            }
          }, 15000)
        }

        socket.onmessage = event => {
          if (event.data === 'pong') return
          try {
            const data = JSON.parse(event.data) as SimulationState
            setState(data)
            setConnectionStatus('connected')
          } catch {
            // Non-JSON message, ignore
          }
        }

        socket.onclose = () => {
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
          if (isUnmountingRef.current) return

          setConnectionStatus('reconnecting')
          retryCountRef.current += 1
          const delay = Math.min(1000 * Math.pow(1.5, retryCountRef.current), 10000)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
        }

        socket.onerror = () => {
          setConnectionStatus('disconnected')
        }
      } catch {
        setConnectionStatus('disconnected')
        const delay = Math.min(1000 * Math.pow(1.5, retryCountRef.current), 10000)
        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, delay)
      }
    }

    connect()

    return () => {
      isUnmountingRef.current = true
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
      if (socketRef.current) {
        socketRef.current.close()
      }
    }
  }, [setState, setConnectionStatus, notify])
}

