import { useState } from 'react'
import { Bot, ChevronDown, ChevronUp, Languages, MessageCircle, Send, Sparkles, User, X } from 'lucide-react'
import { api } from '../api/client'
import { SUPPORTED_LANGUAGES, useLanguageStore, useTranslation, type SupportedLanguage } from '../onboarding/i18n'

interface ChatMessage {
  id: string
  sender: 'user' | 'assistant'
  text: string
  timestamp: string
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
      text: 'MedFlow Clinical Intelligence Copilot active. Query live unit telemetry, triage bottlenecks, or scenario impacts.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const handleSend = async (customText?: string) => {
    const textToSend = (customText || input).trim()
    if (!textToSend || loading) return

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

    setMessages(prev => [...prev, userMsg])
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
      }
      setMessages(prev => [...prev, botMsg])
    } catch {
      const errorMsg: ChatMessage = {
        id: `bot-err-${Date.now()}`,
        sender: 'assistant',
        text: 'Clinical telemetry feed unavailable. Please ensure MedFlow backend is running.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
      {/* Floating Chat Modal */}
      {isOpen && (
        <div className="mb-3 w-96 sm:w-[420px] bg-white border border-slate-200 rounded-2xl shadow-float overflow-hidden flex flex-col transition-all animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header matching Sentinel dark aesthetics */}
          <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
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
              {/* Multilingual Selector */}
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300">
                <Languages size={12} className="text-slate-400" />
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value as SupportedLanguage)}
                  className="bg-transparent border-none text-[11px] font-semibold text-slate-200 cursor-pointer focus:outline-none"
                  aria-label="Copilot Language"
                >
                  {SUPPORTED_LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code} className="bg-slate-900 text-white">
                      {lang.native}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close Copilot"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Quick Prompts Bar */}
          <div className="bg-slate-50 border-b border-slate-100 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <Sparkles size={12} className="text-slate-400 shrink-0" />
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => void handleSend(prompt)}
                className="whitespace-nowrap text-[10px] font-medium px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Messages Container */}
          <div className="h-80 overflow-y-auto p-4 flex flex-col gap-3 bg-slate-50/50">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-2 max-w-[85%] text-xs ${
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
                  className={`p-3 rounded-xl ${
                    msg.sender === 'user'
                      ? 'bg-slate-900 text-white rounded-tr-none'
                      : 'bg-white text-slate-800 border border-slate-200/80 shadow-sm rounded-tl-none'
                  }`}
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  <span
                    className={`block text-[9px] mt-1 font-mono text-right ${
                      msg.sender === 'user' ? 'text-slate-400' : 'text-slate-400'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 text-xs text-slate-500 items-center mr-auto bg-white border border-slate-200 px-3 py-2 rounded-xl">
                <Bot size={14} className="text-emerald-500 animate-spin" />
                <span className="font-medium text-[11px]">Querying live simulation telemetry...</span>
              </div>
            )}
          </div>

          {/* Input Form */}
          <form
            onSubmit={e => {
              e.preventDefault()
              void handleSend()
            }}
            className="p-3 bg-white border-t border-slate-100 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={e => {
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
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      {/* Floating Action Trigger Button */}
      <button
        data-tour="clinical-copilot"
        onClick={() => setIsOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900 text-white shadow-float hover:bg-slate-800 hover:scale-105 transition-all text-xs font-bold"
      >
        <MessageCircle size={16} className="text-emerald-400" />
        <span>{t('chat.title')}</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
      </button>
    </div>
  )
}
