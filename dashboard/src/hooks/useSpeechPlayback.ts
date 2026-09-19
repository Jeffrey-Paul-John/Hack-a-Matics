/**
 * Singleton Audio Manager for MedFlow Text-to-Speech playback.
 * Enforces exactly one playback at any time, FIFO queueing, prefetching chunk N+1,
 * playback token invalidation for stale chunks, and user gesture unlocking.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client'
import { prepareForSpeech, splitIntoSentences, detectChunkLanguage } from '../utils/textPreparation'

export type MessagePlaybackState = 'idle' | 'queued' | 'loading' | 'playing' | 'paused' | 'error'

interface QueueItem {
  messageId: string
  text: string
  language?: string
}

export class AudioManager {
  private static instance: AudioManager | null = null

  private audio: HTMLAudioElement | null = null
  private unlocked = false
  private activeToken = 0
  private abortController: AbortController | null = null

  private activeItem: QueueItem | null = null
  private activeChunks: string[] = []
  private currentChunkIndex = 0
  private prefetchedNextBlob: Promise<Blob> | null = null
  private currentBlobUrl: string | null = null

  private queue: QueueItem[] = []
  private state: MessagePlaybackState = 'idle'
  private voice: string = 'shubh'
  private autoPlay: boolean = false
  private stopOnSend: boolean = false
  private voiceEnabled: boolean = false
  private listeners: Set<() => void> = new Set()

  private constructor() {
    if (typeof window !== 'undefined') {
      try {
        const storedVoice = localStorage.getItem('medflow_tts_voice')
        if (storedVoice === 'shubh' || storedVoice === 'simran') {
          this.voice = storedVoice
        }
        this.voiceEnabled = localStorage.getItem('medflow_tts_enabled') === 'true'
        this.autoPlay = localStorage.getItem('medflow_tts_autoplay') === 'true'
        this.stopOnSend = localStorage.getItem('medflow_tts_stop_on_send') === 'true'
      } catch {
        // LocalStorage fallback
      }
    }
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager()
    }
    return AudioManager.instance
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    this.listeners.forEach((l) => l())
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio()
      this.audio.onended = () => this.handleChunkEnded()
      this.audio.onerror = (e) => {
        console.warn('[TTS Audio Error]', e)
        this.handleError()
      }
    }
    return this.audio
  }

  public unlockUserGesture(): void {
    if (this.unlocked) return
    try {
      const a = this.ensureAudio()
      // Silent short buffer to unlock browser autoplay policy
      a.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='
      a.play()
        .then(() => {
          a.pause()
          this.unlocked = true
        })
        .catch(() => {
          // Will unlock on next click
        })
    } catch {
      // Ignore
    }
  }

  // Getters & Setters
  public getVoice(): string {
    return this.voice
  }

  public setVoice(voice: string): void {
    if (voice !== 'shubh' && voice !== 'simran') return
    this.voice = voice
    try {
      localStorage.setItem('medflow_tts_voice', voice)
    } catch {}
    this.notify()
  }

  public isVoiceEnabled(): boolean {
    return this.voiceEnabled
  }

  public setVoiceEnabled(enabled: boolean): void {
    this.voiceEnabled = enabled
    try {
      localStorage.setItem('medflow_tts_enabled', enabled ? 'true' : 'false')
    } catch {}
    if (!enabled) {
      this.stop()
      this.clearQueue()
    } else {
      this.unlockUserGesture()
    }
    this.notify()
  }

  public isAutoPlay(): boolean {
    return this.autoPlay
  }

  public setAutoPlay(enabled: boolean): void {
    this.autoPlay = enabled
    try {
      localStorage.setItem('medflow_tts_autoplay', enabled ? 'true' : 'false')
    } catch {}
    this.notify()
  }

  public isStopOnSend(): boolean {
    return this.stopOnSend
  }

  public setStopOnSend(enabled: boolean): void {
    this.stopOnSend = enabled
    try {
      localStorage.setItem('medflow_tts_stop_on_send', enabled ? 'true' : 'false')
    } catch {}
    this.notify()
  }

  public getActiveMessageId(): string | null {
    return this.activeItem?.messageId ?? null
  }

  public getQueueLength(): number {
    return this.queue.length
  }

  public getPlaybackState(): MessagePlaybackState {
    return this.state
  }

  public getMessageState(messageId: string): { state: MessagePlaybackState; position?: number } {
    if (this.activeItem?.messageId === messageId) {
      return { state: this.state }
    }
    const idx = this.queue.findIndex((q) => q.messageId === messageId)
    if (idx !== -1) {
      return { state: 'queued', position: idx + 1 }
    }
    return { state: 'idle' }
  }

  // Playback Control APIs
  public enqueue(messageId: string, text: string, language?: string): void {
    if (!this.voiceEnabled) return
    this.unlockUserGesture()

    // If already active or queued, do nothing
    if (this.activeItem?.messageId === messageId) return
    if (this.queue.some((q) => q.messageId === messageId)) return

    this.queue.push({ messageId, text, language })

    if (this.state === 'idle') {
      this.startNextFromQueue()
    } else {
      this.notify()
    }
  }

  public playNow(messageId: string, text: string, language?: string): void {
    this.unlockUserGesture()
    // Stop current, abort requests, increment token
    this.stopCurrent()

    // Remove if already in queue
    this.queue = this.queue.filter((q) => q.messageId !== messageId)

    // Set as active and play immediately
    this.activeItem = { messageId, text, language }
    this.startActivePlayback()
  }

  public pause(): void {
    if (this.audio && this.state === 'playing') {
      this.audio.pause()
      this.state = 'paused'
      this.notify()
    }
  }

  public resume(): void {
    if (this.audio && this.state === 'paused') {
      this.audio.play().catch(() => {})
      this.state = 'playing'
      this.notify()
    }
  }

  public stop(): void {
    this.stopCurrent()
    this.state = 'idle'
    this.notify()
  }

  public clearQueue(): void {
    this.queue = []
    this.notify()
  }

  public onNewUserMessageSent(): void {
    if (this.stopOnSend) {
      this.stop()
      this.clearQueue()
    }
  }

  private stopCurrent(): void {
    this.activeToken++
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    if (this.audio) {
      this.audio.pause()
      this.audio.removeAttribute('src')
    }
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl)
      this.currentBlobUrl = null
    }
    this.activeItem = null
    this.activeChunks = []
    this.currentChunkIndex = 0
    this.prefetchedNextBlob = null
  }

  private startNextFromQueue(): void {
    if (this.queue.length === 0) {
      this.state = 'idle'
      this.activeItem = null
      this.notify()
      return
    }

    const nextItem = this.queue.shift()!
    this.activeItem = nextItem
    this.startActivePlayback()
  }

  private startActivePlayback(): void {
    if (!this.activeItem) return

    const token = ++this.activeToken
    this.state = 'loading'
    this.notify()

    const prepared = prepareForSpeech(this.activeItem.text, this.activeItem.language)
    this.activeChunks = splitIntoSentences(prepared, 500)
    this.currentChunkIndex = 0
    this.prefetchedNextBlob = null

    if (this.activeChunks.length === 0) {
      this.startNextFromQueue()
      return
    }

    this.playChunk(this.currentChunkIndex, token)
  }

  private async fetchChunkAudio(
    text: string,
    lang?: string,
    signal?: AbortSignal
  ): Promise<Blob> {
    const detectedLang = detectChunkLanguage(text, lang)
    return api.ttsSpeak(
      {
        text,
        voice: this.voice,
        language_code: detectedLang,
        pace: 1.0,
      },
      signal
    )
  }

  private async playChunk(index: number, token: number): Promise<void> {
    if (token !== this.activeToken || !this.activeItem) return

    this.currentChunkIndex = index
    const chunkText = this.activeChunks[index]
    const lang = this.activeItem.language

    this.abortController = new AbortController()
    const signal = this.abortController.signal

    try {
      let audioBlob: Blob

      // Use prefetched blob if available from previous chunk
      if (this.prefetchedNextBlob) {
        audioBlob = await this.prefetchedNextBlob
        this.prefetchedNextBlob = null
      } else {
        audioBlob = await this.fetchChunkAudio(chunkText, lang, signal)
      }

      if (token !== this.activeToken) return

      // Revoke previous blob URL
      if (this.currentBlobUrl) {
        URL.revokeObjectURL(this.currentBlobUrl)
      }

      this.currentBlobUrl = URL.createObjectURL(audioBlob)
      const a = this.ensureAudio()
      a.src = this.currentBlobUrl

      // Prefetch chunk N + 1 immediately while playing chunk N
      const nextIndex = index + 1
      if (nextIndex < this.activeChunks.length) {
        const nextText = this.activeChunks[nextIndex]
        this.prefetchedNextBlob = this.fetchChunkAudio(nextText, lang, signal).catch((err) => {
          console.warn('[TTS Prefetch Error]', err)
          return audioBlob // fallback
        })
      } else {
        this.prefetchedNextBlob = null
      }

      await a.play()
      this.state = 'playing'
      this.notify()
    } catch (err: unknown) {
      if (token !== this.activeToken) return
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      console.warn('[TTS Playback Failed]', err)
      this.handleError()
    }
  }

  private handleChunkEnded(): void {
    const token = this.activeToken
    const nextIndex = this.currentChunkIndex + 1

    if (nextIndex < this.activeChunks.length) {
      this.playChunk(nextIndex, token)
    } else {
      // Completed all chunks of active message!
      if (this.currentBlobUrl) {
        URL.revokeObjectURL(this.currentBlobUrl)
        this.currentBlobUrl = null
      }
      this.startNextFromQueue()
    }
  }

  private handleError(): void {
    this.state = 'error'
    this.notify()
    // Skip to next item after 2s error display
    setTimeout(() => {
      if (this.state === 'error') {
        this.startNextFromQueue()
      }
    }, 2000)
  }
}

export function useSpeechPlayback() {
  const manager = AudioManager.getInstance()
  const [, setTick] = useState(0)

  useEffect(() => {
    const unsubscribe = manager.subscribe(() => {
      setTick((t) => t + 1)
    })
    return () => {
      unsubscribe()
    }
  }, [manager])

  return {
    isVoiceEnabled: manager.isVoiceEnabled(),
    setVoiceEnabled: useCallback((v: boolean) => manager.setVoiceEnabled(v), [manager]),
    voice: manager.getVoice(),
    setVoice: useCallback((v: string) => manager.setVoice(v), [manager]),
    isAutoPlay: manager.isAutoPlay(),
    setAutoPlay: useCallback((v: boolean) => manager.setAutoPlay(v), [manager]),
    isStopOnSend: manager.isStopOnSend(),
    setStopOnSend: useCallback((v: boolean) => manager.setStopOnSend(v), [manager]),

    playbackState: manager.getPlaybackState(),
    activeMessageId: manager.getActiveMessageId(),
    queueLength: manager.getQueueLength(),

    enqueue: useCallback(
      (messageId: string, text: string, language?: string) =>
        manager.enqueue(messageId, text, language),
      [manager]
    ),
    playNow: useCallback(
      (messageId: string, text: string, language?: string) =>
        manager.playNow(messageId, text, language),
      [manager]
    ),
    pause: useCallback(() => manager.pause(), [manager]),
    resume: useCallback(() => manager.resume(), [manager]),
    stop: useCallback(() => manager.stop(), [manager]),
    clearQueue: useCallback(() => manager.clearQueue(), [manager]),
    onNewUserMessageSent: useCallback(() => manager.onNewUserMessageSent(), [manager]),
    getMessageState: useCallback(
      (messageId: string) => manager.getMessageState(messageId),
      [manager]
    ),
  }
}
