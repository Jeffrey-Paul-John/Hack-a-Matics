import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AudioManager } from './useSpeechPlayback'
import { api } from '../api/client'

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

if (typeof window === 'undefined' || !window.HTMLMediaElement) {
  class MockAudio {
    src = ''
    onended: (() => void) | null = null
    onerror: ((e: any) => void) | null = null
    play = vi.fn().mockResolvedValue(undefined)
    pause = vi.fn()
    removeAttribute = vi.fn()
  }
  ;(global as any).Audio = MockAudio
  ;(global as any).window = {
    ...global.window,
    Audio: MockAudio,
    HTMLMediaElement: { prototype: MockAudio.prototype },
    URL: { createObjectURL: vi.fn().mockReturnValue('blob:mock-url'), revokeObjectURL: vi.fn() },
  }
}

describe('AudioManager Singleton & Playback Queue', () => {
  let manager: AudioManager

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    // Configure HTMLMediaElement test spies
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    window.HTMLMediaElement.prototype.pause = vi.fn()
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-audio-url')
    window.URL.revokeObjectURL = vi.fn()

    manager = AudioManager.getInstance()
    manager.stop()
    manager.clearQueue()
    manager.setVoiceEnabled(false)
    manager.setAutoPlay(false)
  })

  it('initializes with voice disabled and autoplay OFF by default', () => {
    expect(manager.isVoiceEnabled()).toBe(false)
    expect(manager.isAutoPlay()).toBe(false)
    expect(manager.getPlaybackState()).toBe('idle')
    expect(manager.getQueueLength()).toBe(0)
  })

  it('updates and persists voice selection to localStorage', () => {
    manager.setVoice('simran')
    expect(manager.getVoice()).toBe('simran')
    expect(localStorage.getItem('medflow_tts_voice')).toBe('simran')

    // Disallows invalid voice
    manager.setVoice('invalid_voice')
    expect(manager.getVoice()).toBe('simran')
  })

  it('clears queue and stops audio when voice is disabled', () => {
    manager.setVoiceEnabled(true)
    expect(manager.isVoiceEnabled()).toBe(true)

    manager.setVoiceEnabled(false)
    expect(manager.isVoiceEnabled()).toBe(false)
    expect(manager.getQueueLength()).toBe(0)
    expect(manager.getPlaybackState()).toBe('idle')
  })

  it('enqueues messages in FIFO order and updates queue positions', () => {
    manager.setVoiceEnabled(true)
    const mockBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' })
    vi.spyOn(api, 'ttsSpeak').mockResolvedValue(mockBlob)

    manager.enqueue('msg-1', 'First message to play.')
    manager.enqueue('msg-2', 'Second message in queue.')
    manager.enqueue('msg-3', 'Third message in queue.')

    expect(manager.getActiveMessageId()).toBe('msg-1')
    expect(manager.getMessageState('msg-2')).toEqual({ state: 'queued', position: 1 })
    expect(manager.getMessageState('msg-3')).toEqual({ state: 'queued', position: 2 })
    expect(manager.getQueueLength()).toBe(2)
  })

  it('playNow preempts current playback and plays immediately', () => {
    manager.setVoiceEnabled(true)
    const mockBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' })
    vi.spyOn(api, 'ttsSpeak').mockResolvedValue(mockBlob)

    manager.playNow('msg-1', 'Initial active message.')
    expect(manager.getActiveMessageId()).toBe('msg-1')

    // Preempt with msg-2
    manager.playNow('msg-2', 'Preempting message now.')
    expect(manager.getActiveMessageId()).toBe('msg-2')
  })

  it('stop() resets playback to idle and aborts current chunk', () => {
    manager.setVoiceEnabled(true)
    manager.playNow('msg-1', 'Playing message.')
    manager.stop()

    expect(manager.getPlaybackState()).toBe('idle')
    expect(manager.getActiveMessageId()).toBe(null)
  })

  it('onNewUserMessageSent clears queue and stops if stopOnSend is enabled', () => {
    manager.setVoiceEnabled(true)
    manager.setStopOnSend(true)
    manager.enqueue('msg-1', 'Message 1')
    manager.enqueue('msg-2', 'Message 2')

    manager.onNewUserMessageSent()

    expect(manager.getPlaybackState()).toBe('idle')
    expect(manager.getQueueLength()).toBe(0)
  })
})
