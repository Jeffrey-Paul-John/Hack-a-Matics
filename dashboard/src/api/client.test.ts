import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolveApiBaseUrl, resolveWsUrl, getSessionId } from './client'
import { AudioManager } from '../hooks/useSpeechPlayback'

const mockStorage: Record<string, string> = {}
global.localStorage = {
  getItem: (k: string) => mockStorage[k] ?? null,
  setItem: (k: string, v: string) => {
    mockStorage[k] = String(v)
  },
  removeItem: (k: string) => {
    delete mockStorage[k]
  },
  clear: () => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k])
  },
  length: 0,
  key: () => null,
} as unknown as Storage

if (typeof global.Audio === 'undefined') {
  class MockAudio {
    src = ''
    onended: (() => void) | null = null
    onerror: ((e: any) => void) | null = null
    play = vi.fn().mockResolvedValue(undefined)
    pause = vi.fn()
  }
  ;(global as any).Audio = MockAudio
}

describe('API and WebSocket URL Resolution', () => {
  it('derives ws:// from http:// and wss:// from https://', () => {
    expect(resolveWsUrl('http://localhost:8000', '/ws/live')).toBe('ws://localhost:8000/ws/live')
    expect(resolveWsUrl('http://10.0.2.2:8000', '/ws/live')).toBe('ws://10.0.2.2:8000/ws/live')
    expect(resolveWsUrl('https://api.medflow.health', '/ws/live')).toBe('wss://api.medflow.health/ws/live')
  })

  it('handles paths with or without leading slashes', () => {
    expect(resolveWsUrl('http://localhost:8000', 'ws/live')).toBe('ws://localhost:8000/ws/live')
    expect(resolveWsUrl('https://api.medflow.health', '/ws/custom')).toBe('wss://api.medflow.health/ws/custom')
  })
})

describe('localStorage Persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists and retrieves session ID across reads', () => {
    const sid1 = getSessionId()
    expect(sid1).toMatch(/^sess_/)
    expect(localStorage.getItem('medflow_session_id')).toBe(sid1)

    // Second call should return the exact same persisted session ID
    const sid2 = getSessionId()
    expect(sid2).toBe(sid1)
  })

  it('persists TTS voice and autoplay settings across instances', () => {
    const manager = AudioManager.getInstance()
    manager.setVoice('simran')
    manager.setAutoPlay(true)
    manager.setVoiceEnabled(true)

    expect(localStorage.getItem('medflow_tts_voice')).toBe('simran')
    expect(localStorage.getItem('medflow_tts_autoplay')).toBe('true')
    expect(localStorage.getItem('medflow_tts_enabled')).toBe('true')
  })

  it('unlockUserGesture can be safely invoked on user interaction', () => {
    const manager = AudioManager.getInstance()
    expect(() => manager.unlockUserGesture()).not.toThrow()
  })
})
