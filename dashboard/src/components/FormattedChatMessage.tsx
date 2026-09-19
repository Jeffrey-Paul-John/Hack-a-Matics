import React from 'react'

const INLINE_REGEX = /(\*\*\*[\s\S]+?\*\*\*|___[\s\S]+?___|\*\*[\s\S]+?\*\*|__[\s\S]+?__|`[^`]+`|\*[^*\n]+?\*|_[^_\n]+?_|~~[\s\S]+?~~)/g

/**
 * Pure function to format inline markdown (bold, italic, code, strikethrough).
 */
export function renderInline(text: string, isUser: boolean): React.ReactNode[] {
  const parts = text.split(INLINE_REGEX)
  return parts.map((part, idx) => {
    if (!part) return null

    // Bold + Italic (***text*** or ___text___)
    if (
      (part.startsWith('***') && part.endsWith('***') && part.length >= 6) ||
      (part.startsWith('___') && part.endsWith('___') && part.length >= 6)
    ) {
      return (
        <strong key={idx} className={isUser ? 'font-bold text-white' : 'font-bold text-slate-950'}>
          <em className="italic">{part.slice(3, -3)}</em>
        </strong>
      )
    }

    // Bold (**text** or __text__)
    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      return (
        <strong
          key={idx}
          className={
            isUser
              ? 'font-bold text-white'
              : 'font-bold text-slate-950 bg-indigo-50/60 px-0.5 rounded'
          }
        >
          {part.slice(2, -2)}
        </strong>
      )
    }

    // Inline Code (`code`)
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className={
            isUser
              ? 'px-1.5 py-0.5 rounded font-mono text-[11px] bg-slate-800 text-emerald-300 font-semibold'
              : 'px-1.5 py-0.5 rounded font-mono text-[11px] bg-slate-100 text-indigo-700 border border-slate-200/80 font-semibold'
          }
        >
          {part.slice(1, -1)}
        </code>
      )
    }

    // Italic (*text* or _text_)
    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      return (
        <em key={idx} className="italic">
          {part.slice(1, -1)}
        </em>
      )
    }

    // Strikethrough (~~text~~)
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      return (
        <span key={idx} className="line-through opacity-75">
          {part.slice(2, -2)}
        </span>
      )
    }

    return part
  })
}

/**
 * Normalizes text spacing, separating numbers accidentally concatenated with words (e.g. 5ICU -> 5 ICU)
 * while preserving ordinals (1st, 2nd, 3rd, 4th).
 */
export function formatMessageText(text: string): string {
  if (!text) return ''
  let cleaned = text.replace(/\b(\d+)(?!(?:st|nd|rd|th)\b)([a-zA-Z]+)\b/g, '$1 $2')
  cleaned = cleaned.replace(/\b([a-zA-Z]+)(\d+)\b/g, '$1 $2')
  return cleaned
}

/**
 * Ensures key clinical telemetry metrics and availability counts are formatted with bold for visual clarity,
 * matching the copilot standard.
 */
export function autoBoldMetrics(text: string): string {
  if (!text) return ''
  // 1. Bold unbolded counts like "5 ICU beds", "0 active SLA breaches", "0 patients waiting"
  let res = text.replace(
    /(?<!\*\*)(\b\d+\s+(?:ICU\s+)?(?:beds?|doctors?|nurses?|ambulances?|patients?(?:\s+waiting)?|ventilators?|active SLA breaches?)\b)(?!\*\*)/gi,
    '**$1**'
  )
  // 2. Bold unbolded availability like "5/5 available", "8/8 available"
  res = res.replace(
    /(?<!\*\*)(\b\d+\/\d+\s+available\b)(?!\*\*)/gi,
    '**$1**'
  )
  return res
}

interface FormattedChatMessageProps {
  text: string
  isUser: boolean
}

/**
 * Rich message formatter for MedFlow Copilot chat.
 * Correctly renders bold text, italics, inline code, lists, and headers without raw markdown tags.
 */
export function FormattedChatMessage({ text, isUser }: FormattedChatMessageProps) {
  if (!text) return null

  // 1. Normalize spacing (e.g. 5ICU -> 5 ICU)
  let processed = formatMessageText(text)

  // 2. Auto-bold metrics in assistant responses if omitted
  if (!isUser) {
    processed = autoBoldMetrics(processed)
  }

  // Check for fenced code blocks ``` ... ```
  if (processed.includes('```')) {
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g
    const chunks: React.ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = codeBlockRegex.exec(processed)) !== null) {
      const matchIndex = match.index
      if (matchIndex > lastIndex) {
        chunks.push(
          <FormattedTextBlocks
            key={`chunk-${lastIndex}`}
            rawText={processed.slice(lastIndex, matchIndex)}
            isUser={isUser}
          />
        )
      }
      const lang = match[1]
      const code = match[2]
      chunks.push(
        <div key={`code-${matchIndex}`} className="my-2 rounded-lg overflow-hidden border border-slate-700 bg-slate-900 text-slate-100 font-mono text-[11px] p-3">
          {lang && (
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1 pb-1 border-b border-slate-800">
              {lang}
            </div>
          )}
          <pre className="overflow-x-auto whitespace-pre">
            <code>{code.trim()}</code>
          </pre>
        </div>
      )
      lastIndex = codeBlockRegex.lastIndex
    }

    if (lastIndex < processed.length) {
      chunks.push(
        <FormattedTextBlocks
          key={`chunk-${lastIndex}`}
          rawText={processed.slice(lastIndex)}
          isUser={isUser}
        />
      )
    }

    return <div className="space-y-1">{chunks}</div>
  }

  return <FormattedTextBlocks rawText={processed} isUser={isUser} />
}

function FormattedTextBlocks({ rawText, isUser }: { rawText: string; isUser: boolean }) {
  const lines = rawText.split(/\r?\n/)
  const elements: React.ReactNode[] = []

  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null

  const flushList = (keyPrefix: number | string) => {
    if (!currentList) return
    if (currentList.type === 'ul') {
      elements.push(
        <ul key={`ul-${keyPrefix}`} className="my-1.5 ml-4 list-disc space-y-1">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item, isUser)}
            </li>
          ))}
        </ul>
      )
    } else {
      elements.push(
        <ol key={`ol-${keyPrefix}`} className="my-1.5 ml-4 list-decimal space-y-1">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item, isUser)}
            </li>
          ))}
        </ol>
      )
    }
    currentList = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Empty line
    if (!trimmed) {
      flushList(i)
      elements.push(<div key={`blank-${i}`} className="h-1.5" />)
      continue
    }

    // Unordered list item (- item, * item, • item)
    const ulMatch = line.match(/^\s*[-*•]\s+(.*)$/)
    if (ulMatch) {
      if (currentList && currentList.type !== 'ul') {
        flushList(i)
      }
      if (!currentList) {
        currentList = { type: 'ul', items: [] }
      }
      currentList.items.push(ulMatch[1])
      continue
    }

    // Ordered list item (1. item, 2. item)
    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/)
    if (olMatch) {
      if (currentList && currentList.type !== 'ol') {
        flushList(i)
      }
      if (!currentList) {
        currentList = { type: 'ol', items: [] }
      }
      currentList.items.push(olMatch[1])
      continue
    }

    // If we reach a non-list line, flush any active list
    flushList(i)

    // Heading lines
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4
          key={`h4-${i}`}
          className={`font-bold text-xs mt-2 mb-1 ${isUser ? 'text-white' : 'text-slate-900'}`}
        >
          {renderInline(trimmed.slice(4), isUser)}
        </h4>
      )
      continue
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3
          key={`h3-${i}`}
          className={`font-bold text-sm mt-2 mb-1 ${isUser ? 'text-white' : 'text-slate-900'}`}
        >
          {renderInline(trimmed.slice(3), isUser)}
        </h3>
      )
      continue
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2
          key={`h2-${i}`}
          className={`font-extrabold text-sm mt-2.5 mb-1 ${isUser ? 'text-white' : 'text-slate-900'}`}
        >
          {renderInline(trimmed.slice(2), isUser)}
        </h2>
      )
      continue
    }

    // Standard paragraph line
    elements.push(
      <p key={`p-${i}`} className="leading-relaxed my-0.5">
        {renderInline(line, isUser)}
      </p>
    )
  }

  // Flush remaining list if document ends with a list
  flushList('end')

  return <div className="space-y-0.5">{elements}</div>
}
