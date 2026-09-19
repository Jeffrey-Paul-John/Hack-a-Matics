/**
 * Pure functions for text preprocessing, sentence segmentation, and clinical redaction before TTS.
 */

export const BCP47_LANGUAGE_MAP: Record<string, string> = {
  en: 'en-IN',
  'en-IN': 'en-IN',
  hi: 'hi-IN',
  'hi-IN': 'hi-IN',
  kn: 'kn-IN',
  'kn-IN': 'kn-IN',
  te: 'te-IN',
  'te-IN': 'te-IN',
  ta: 'ta-IN',
  'ta-IN': 'ta-IN',
  bn: 'bn-IN',
  'bn-IN': 'bn-IN',
  mr: 'mr-IN',
  'mr-IN': 'mr-IN',
  gu: 'gu-IN',
  'gu-IN': 'gu-IN',
  pa: 'pa-IN',
  'pa-IN': 'pa-IN',
  od: 'od-IN',
  'od-IN': 'od-IN',
  ml: 'ml-IN',
  'ml-IN': 'ml-IN',
}

/**
 * Maps application language code to supported BCP-47 language tag, falling back to en-IN.
 */
export function mapAppLanguageToBCP47(langCode?: string): string {
  if (!langCode) return 'en-IN'
  const clean = langCode.trim()
  return BCP47_LANGUAGE_MAP[clean] || BCP47_LANGUAGE_MAP[clean.split('-')[0]] || 'en-IN'
}

/**
 * Detect script language per chunk; falls back to preferred or en-IN.
 */
export function detectChunkLanguage(text: string, preferred: string = 'en-IN'): string {
  if (/[\u0900-\u097F]/.test(text)) return 'hi-IN'
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn-IN'
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN'
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta-IN'
  if (/[\u0980-\u09FF]/.test(text)) return 'bn-IN'
  return mapAppLanguageToBCP47(preferred)
}

/**
 * Client-side clinical identifier scrubber (names, MRNs, phone numbers, DOBs).
 */
export function redactClientClinicalText(text: string): string {
  return text
    .replace(/\bMRN[:\s#-]*[A-Z0-9]{4,12}\b/gi, '[Medical Record Number]')
    .replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '[Contact Number]')
    .replace(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, '[Contact Number]')
    .replace(/\b(?:DOB|Date of Birth)[:\s]+[0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{1,4}\b/gi, '[Date of Birth]')
    .replace(/\bPatient\s+P\d{4}\b/gi, 'the patient')
    .replace(/\b\d{4}\s\d{4}\s\d{4}\b/g, '[ID Number]')
}

/**
 * Strips markdown, handles tables/code blocks, expands medical acronyms and math symbols.
 */
export function prepareForSpeech(markdown: string, languageCode: string = 'en-IN'): string {
  if (!markdown) return ''

  let text = markdown

  // 1. Redact clinical identifiers
  text = redactClientClinicalText(text)

  // 2. Remove code blocks ```...```
  text = text.replace(/```[\s\S]*?```/g, '')

  // 3. Remove inline code `...`
  text = text.replace(/`([^`]+)`/g, '$1')

  // 4. Handle Markdown tables: replace with verbal indicator
  const tableRegex = /(?:\|[^\n]+\|\r?\n)(?:\|[ :\-\|]+\|\r?\n)(?:\|[^\n]+\|\r?\n?)+/g
  text = text.replace(tableRegex, ' Please see the detailed table on screen. ')

  // 5. Convert links [label](url) -> label
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')

  // 6. Strip headers (# Header -> Header)
  text = text.replace(/^#{1,6}\s+/gm, '')

  // 7. Strip bold and italic formatting
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2')
  text = text.replace(/(\*|_)(.*?)\1/g, '$2')
  text = text.replace(/~~(.*?)~~/g, '$1')

  // 8. Convert list markers (* item, - item, 1. item) to natural pauses
  text = text.replace(/^\s*[-*+]\s+/gm, '')
  text = text.replace(/^\s*\d+\.\s+/gm, '')

  // 9. Standard mathematical and directional symbol substitutions
  text = text
    .replace(/[→⇒]|->/g, ' leads to ')
    .replace(/[≥]|>=/g, ' greater than or equal to ')
    .replace(/[≤]|<=/g, ' less than or equal to ')
    .replace(/±/g, ' plus or minus ')
    .replace(/&/g, ' and ')
    .replace(/@/g, ' at ')

  // 10. Language-gated English expansions
  const bcp47 = mapAppLanguageToBCP47(languageCode)
  const isEnglish = bcp47 === 'en-IN'

  if (isEnglish) {
    // Case-sensitive whole-word expansions
    text = text
      .replace(/\bED\b/g, 'Emergency Department')
      .replace(/\bICU\b/g, 'I.C.U.')
      .replace(/\bSLA\b/g, 'S.L.A.')
      .replace(/\bFIFO\b/g, 'F.I.F.O.')
      .replace(/\bMDP\b/g, 'M.D.P.')
      .replace(/\bCRN\b/g, 'C.R.N.')
      .replace(/\bmin\b/g, 'minutes')
      .replace(/\bsec\b/g, 'seconds')
      .replace(/\bhrs?\b/gi, 'hours')
      .replace(/\bP90\b/g, '90th percentile')
      .replace(/\bp90\b/g, '90th percentile')
      // Percent sign after numbers or stand-alone
      .replace(/(\d+)\s*%/g, '$1 percent')
      .replace(/%/g, ' percent')
  } else {
    // For non-English languages, expand percent sign safely
    text = text.replace(/(\d+)\s*%/g, '$1 %')
  }

  // 11. Normalize excessive whitespace, multiple dots, and trim
  text = text
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/([!?,;])\1+/g, '$1')
    .trim()

  return text
}

const COMMON_ABBREVIATIONS = new Set([
  'dr.', 'mr.', 'mrs.', 'ms.', 'prof.', 'vs.', 'e.g.', 'i.e.', 'etc.',
  'approx.', 'min.', 'sec.', 'dept.', 'no.', 'fig.', 'al.',
])

/**
 * Splits text into natural sentence chunks of <= maxChunkLength characters (default 500).
 * Preserves decimals like 52.6, 0.05, 3.14 and common abbreviations without splitting.
 */
export function splitIntoSentences(text: string, maxChunkLength: number = 500): string[] {
  if (!text || !text.trim()) return []

  const clean = text.trim()
  if (clean.length <= maxChunkLength) {
    return [clean]
  }

  // Match sentences ending in ., !, or ? followed by space or end-of-string
  // We avoid splitting on decimals: (?<!\d)\.(?!\d)
  const rawSegments: string[] = []
  let current = ''
  const tokens = clean.split(/(\s+)/)

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    current += token

    const trimmed = current.trim()
    const lastWord = trimmed.split(/\s+/).pop()?.toLowerCase() || ''

    const isAbbreviation = COMMON_ABBREVIATIONS.has(lastWord)
    const isDecimal = /\d+\.\d+$/.test(trimmed)

    const endsWithTerminal = /[.!?]$/.test(trimmed) && !isAbbreviation && !isDecimal

    if (endsWithTerminal) {
      rawSegments.push(trimmed)
      current = ''
    }
  }

  if (current.trim()) {
    rawSegments.push(current.trim())
  }

  // Combine small segments into chunks <= maxChunkLength
  const chunks: string[] = []
  let currentChunk = ''

  for (const segment of rawSegments) {
    if (!currentChunk) {
      if (segment.length <= maxChunkLength) {
        currentChunk = segment
      } else {
        // Break oversized sentence by clause boundaries
        const subClauses = splitOversizedSentence(segment, maxChunkLength)
        chunks.push(...subClauses)
      }
    } else if (currentChunk.length + 1 + segment.length <= maxChunkLength) {
      currentChunk += ' ' + segment
    } else {
      chunks.push(currentChunk)
      if (segment.length <= maxChunkLength) {
        currentChunk = segment
      } else {
        const subClauses = splitOversizedSentence(segment, maxChunkLength)
        chunks.push(...subClauses)
        currentChunk = ''
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks.filter((c) => c.length > 0)
}

/**
 * Fallback clause splitter for sentences that individually exceed maxChunkLength.
 */
function splitOversizedSentence(sentence: string, maxLength: number): string[] {
  const parts: string[] = []
  // Split on clause punctuation: , ; : or dash
  const clauses = sentence.split(/([,;:]|\s+-\s+)/)
  let buffer = ''

  for (let i = 0; i < clauses.length; i++) {
    const part = clauses[i]
    if (buffer.length + part.length <= maxLength) {
      buffer += part
    } else {
      if (buffer.trim()) parts.push(buffer.trim())
      if (part.length <= maxLength) {
        buffer = part
      } else {
        // Hard word wrap fallback
        const words = part.split(/\s+/)
        let wordBuf = ''
        for (const w of words) {
          if (wordBuf.length + w.length + 1 <= maxLength) {
            wordBuf += (wordBuf ? ' ' : '') + w
          } else {
            if (wordBuf.trim()) parts.push(wordBuf.trim())
            wordBuf = w
          }
        }
        buffer = wordBuf
      }
    }
  }

  if (buffer.trim()) {
    parts.push(buffer.trim())
  }

  return parts
}
