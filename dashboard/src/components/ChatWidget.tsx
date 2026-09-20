import { useState, useEffect, useRef } from 'react'
import {
  AlertCircle,
  Bot,
  Languages,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  Square,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { api } from '../api/client'
import { SUPPORTED_LANGUAGES, useLanguageStore, useTranslation, type SupportedLanguage } from '../onboarding/i18n'
import { useSpeechPlayback } from '../hooks/useSpeechPlayback'
import { FormattedChatMessage } from './FormattedChatMessage'

interface ChatMessage {
  id: string
  sender: 'user' | 'assistant'
  text: string
  timestamp: string
  serverMessageId?: string
}

interface TtsConfig {
  enabled: boolean
  voices: Array<{ id: string; label: string; gender: string }>
  default_voice: string
  max_text_length: number
}

const QUICK_PROMPTS = [
  'How many ICU beds are free right now?',
  'What is the current queue status?',
  'What are the active SLA breaches?',
  'Which strategy is currently active?',
]

export function detectLanguage(text: string): SupportedLanguage | null {
  const lower = text.toLowerCase()
  if (/[\u0C00-\u0C7F]/.test(text) || lower.includes('telugu')) return 'te'
  if (/[\u0C80-\u0CFF]/.test(text) || lower.includes('kannada')) return 'kn'
  if (/[\u0B80-\u0BFF]/.test(text) || lower.includes('tamil')) return 'ta'
  if (/[\u0900-\u097F]/.test(text) || lower.includes('hindi')) return 'hi'
  return null
}

export function ChatWidget() {
  const { language, setLanguage } = useLanguageStore()
  const { t } = useTranslation()
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      text: 'PulseGrid Clinical Intelligence Copilot active. Query live unit telemetry, triage bottlenecks, or scenario impacts.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  // TTS Configuration & Playback Hook
  const [ttsConfig, setTtsConfig] = useState<TtsConfig | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }

  const {
    isVoiceEnabled,
    setVoiceEnabled,
    voice,
    setVoice,
    isAutoPlay,
    setAutoPlay,
    playbackState,
    queueLength,
    enqueue,
    playNow,
    stop,
    clearQueue,
    onNewUserMessageSent,
    getMessageState,
  } = useSpeechPlayback()

  useEffect(() => {
    api.ttsConfig()
      .then((cfg) => setTtsConfig(cfg))
      .catch(() => setTtsConfig({ enabled: false, voices: [], default_voice: 'shubh', max_text_length: 2500 }))
  }, [])

  useEffect(() => {
    scrollToBottom(true)
  }, [messages, loading, isOpen])

  const handleSend = async (customText?: string) => {
    const textToSend = (customText || input).trim()
    if (!textToSend || loading) return

    // Stop and clear any ongoing audio upon sending a new message
    onNewUserMessageSent()

    // Auto-detect language if user typed in regional language or mentions language
    const detected = detectLanguage(textToSend)
    const activeLang = detected || language
    if (detected && detected !== language) {
      setLanguage(detected)
    }

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await api.chat(textToSend, activeLang)
      if (res.language && ['en', 'hi', 'kn', 'te', 'ta'].includes(res.language) && res.language !== language) {
        setLanguage(res.language as SupportedLanguage)
      }
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        text: res.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        serverMessageId: res.message_id,
      }
      setMessages((prev) => [...prev, botMsg])

      // If voice replies and autoplay are both active, enqueue the new reply
      if (isVoiceEnabled && isAutoPlay) {
        enqueue(botMsg.id, botMsg.text, res.language || activeLang)
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `bot-err-${Date.now()}`,
        sender: 'assistant',
        text: 'Clinical telemetry feed unavailable. Please ensure PulseGrid backend is running.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-40 flex flex-col items-end max-w-[calc(100vw-2rem)]">
      {/* Floating Chat Modal */}
      {isOpen && (
        <div className="mb-3 w-[calc(100vw-2rem)] sm:w-[460px] max-w-[460px] max-h-[78vh] sm:max-h-[85vh] bg-white border border-slate-200 rounded-2xl shadow-float overflow-hidden flex flex-col transition-all animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header matching dark aesthetics */}
          <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
                <Bot size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm tracking-tight text-white">
                    {t('chat.title')}
                  </h3>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <p className="text-[10px] font-medium text-slate-400">
                  {t('chat.subtitle')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Voice Controls in Header (hidden if backend disabled) */}
              {ttsConfig?.enabled && (
                <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700/80 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setVoiceEnabled(!isVoiceEnabled)}
                    className={`p-1 rounded transition-colors ${
                      isVoiceEnabled
                        ? 'text-emerald-400 bg-slate-700'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    aria-label={isVoiceEnabled ? 'Turn voice replies off' : 'Turn voice replies on'}
                    title={isVoiceEnabled ? 'Voice enabled (click to mute)' : 'Voice disabled (click to enable)'}
                  >
                    {isVoiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                  </button>

                  {isVoiceEnabled && (
                    <>
                      <select
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)}
                        className="bg-transparent border-none text-[10px] font-bold text-slate-200 cursor-pointer focus:outline-none pr-1"
                        aria-label="Select voice"
                        title="Voice persona"
                      >
                        {ttsConfig.voices.map((v) => (
                          <option key={v.id} value={v.id} className="bg-slate-900 text-white">
                            {v.id === 'shubh' ? 'Shubh (M)' : v.id === 'simran' ? 'Simran (F)' : v.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          playNow(
                            'preview-sample',
                            language === 'hi'
                              ? 'पल्सग्रिड क्लिनिकल इंटेलिजेंस सक्रिय है।'
                              : 'PulseGrid clinical copilot is operational.',
                            language
                          )
                        }
                        className="text-[9px] font-semibold px-1 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                        aria-label="Preview voice sample"
                        title="Preview voice"
                      >
                        Test
                      </button>

                      {(playbackState === 'playing' || playbackState === 'loading') && (
                        <button
                          type="button"
                          onClick={stop}
                          className="p-1 rounded text-rose-400 hover:text-rose-300 transition-colors"
                          aria-label="Stop audio playback"
                          title="Stop audio"
                        >
                          <Square size={11} fill="currentColor" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Multilingual Selector */}
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300">
                <Languages size={12} className="text-slate-400" />
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                  className="bg-transparent border-none text-[11px] font-semibold text-slate-200 cursor-pointer focus:outline-none"
                  aria-label="Copilot Language"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code} className="bg-slate-900 text-white">
                      {lang.native}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close Copilot"
                aria-label="Close Copilot"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Autoplay & Queue Sub-bar when Voice is ON */}
          {ttsConfig?.enabled && isVoiceEnabled && (
            <div className="bg-slate-100/90 border-b border-slate-200 px-3 py-1 flex items-center justify-between text-[10px] text-slate-600 select-none">
              <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={isAutoPlay}
                  onChange={(e) => setAutoPlay(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-0 w-3 h-3 cursor-pointer"
                  aria-label="Autoplay bot replies"
                />
                <span>Autoplay bot replies aloud</span>
              </label>

              {queueLength > 0 && (
                <button
                  type="button"
                  onClick={clearQueue}
                  className="text-slate-500 hover:text-rose-600 font-semibold transition-colors"
                  aria-label="Clear queued audio"
                >
                  Clear Queue ({queueLength})
                </button>
              )}
            </div>
          )}

          {/* Quick Prompts Bar */}
          <div className="bg-slate-50 border-b border-slate-100 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <Sparkles size={12} className="text-slate-400 shrink-0" />
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => void handleSend(prompt)}
                className="whitespace-nowrap text-[10px] font-medium px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Messages Container */}
          <div className="h-[280px] sm:h-[400px] max-h-[48vh] sm:max-h-[55vh] overflow-y-auto p-3.5 sm:p-4 flex flex-col gap-3 bg-slate-50/50 scroll-smooth">
            {messages.map((msg) => {
              const msgState = getMessageState(msg.id)
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 max-w-[88%] text-xs ${
                    msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      msg.sender === 'user' ? 'bg-slate-900 text-white' : 'bg-emerald-600 text-white shadow-sm'
                    }`}
                  >
                    {msg.sender === 'user' ? <User size={13} /> : <Bot size={13} />}
                  </div>

                  <div
                    className={`p-3.5 pb-2.5 rounded-xl ${
                      msg.sender === 'user'
                        ? 'bg-slate-900 text-white rounded-tr-none'
                        : 'bg-white text-slate-800 border border-slate-200/80 shadow-sm rounded-tl-none'
                    }`}
                  >
                    <FormattedChatMessage text={msg.text} isUser={msg.sender === 'user'} />
                    <span
                      className={`block text-[9px] mt-1 font-mono text-right ${
                        msg.sender === 'user' ? 'text-slate-400' : 'text-slate-400'
                      }`}
                    >
                      {msg.timestamp}
                    </span>

                    {/* Per-message Audio Controls for Assistant Replies */}
                    {msg.sender === 'assistant' && ttsConfig?.enabled && isVoiceEnabled && (
                      <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-100">
                        {msgState.state === 'playing' ? (
                          <button
                            type="button"
                            onClick={stop}
                            aria-label="Stop audio playback"
                            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold hover:bg-emerald-100 transition-colors"
                          >
                            <span className="flex items-end gap-0.5 h-3">
                              <span className="w-0.5 bg-emerald-600 rounded-full animate-bar-1" />
                              <span className="w-0.5 bg-emerald-600 rounded-full animate-bar-2" />
                              <span className="w-0.5 bg-emerald-600 rounded-full animate-bar-3" />
                            </span>
                            <span>Speaking</span>
                            <Square size={8} fill="currentColor" className="ml-0.5 text-emerald-800" />
                          </button>
                        ) : msgState.state === 'loading' ? (
                          <div
                            className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium px-2 py-0.5 rounded-full bg-slate-100"
                            aria-label="Synthesizing audio"
                          >
                            <Loader2 size={11} className="animate-spin text-emerald-600" />
                            <span>Synthesizing...</span>
                          </div>
                        ) : msgState.state === 'queued' ? (
                          <span
                            className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full"
                            aria-label={`Queued position ${msgState.position}`}
                          >
                            Queued #{msgState.position}
                          </span>
                        ) : msgState.state === 'error' ? (
                          <button
                            type="button"
                            onClick={() => playNow(msg.id, msg.text, language)}
                            aria-label="Voice synthesis failed. Click to retry."
                            className="flex items-center gap-1 text-[10px] text-rose-600 hover:text-rose-700 font-medium px-1.5 py-0.5 rounded hover:bg-rose-50 transition-colors"
                          >
                            <AlertCircle size={11} />
                            <span>Voice failed (retry)</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => playNow(msg.id, msg.text, language)}
                            aria-label="Play reply aloud"
                            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-700 font-medium px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
                          >
                            <Volume2 size={11} />
                            <span>Listen</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {loading && (
              <div className="flex gap-2 text-xs text-slate-500 items-center mr-auto bg-white border border-slate-200 px-3 py-2 rounded-xl">
                <Bot size={14} className="text-emerald-500 animate-spin" />
                <span className="font-medium text-[11px]">Querying live simulation telemetry...</span>
              </div>
            )}
            <div ref={messagesEndRef} className="h-1 shrink-0" />
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleSend()
            }}
            className="p-3 bg-white border-t border-slate-100 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => {
                const val = e.target.value
                setInput(val)
                const detected = detectLanguage(val)
                if (detected && detected !== language) {
                  setLanguage(detected)
                }
              }}
              placeholder={t('chat.placeholder')}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-slate-400"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 disabled:opacity-40 transition-all shrink-0"
              title={t('chat.send')}
              aria-label={t('chat.send')}
            >
              <Send size={14} />
            </button>
          </form>

          {/* Privacy & Safety External Service Notice */}
          {ttsConfig?.enabled && isVoiceEnabled && (
            <div className="px-3 py-1 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 text-center select-none">
              Voice replies are generated by an external service.
            </div>
          )}
        </div>
      )}

      {/* Floating Action Trigger Button */}
      <button
        data-tour="clinical-copilot"
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900 text-white shadow-float hover:bg-slate-800 hover:scale-105 transition-all text-xs font-bold"
        aria-label="Open PulseGrid Copilot"
      >
        <MessageCircle size={16} className="text-emerald-400" />
        <span>{t('chat.title')}</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
      </button>
    </div>
  )
}
