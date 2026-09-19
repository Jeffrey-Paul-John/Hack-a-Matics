import { beforeAll, describe, it, expect } from 'vitest'

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

describe('ChatWidget Language Detection & Logic', () => {
  let detectLanguage: (text: string) => string | null

  beforeAll(async () => {
    const mod = await import('./ChatWidget')
    detectLanguage = mod.detectLanguage
  })

  it('detects Hindi script (Devanagari)', () => {
    expect(detectLanguage('अस्पताल में कितने बिस्तर खाली हैं?')).toBe('hi')
  })

  it('detects Telugu script', () => {
    expect(detectLanguage('హాస్పిటల్ లో బెడ్స్ ఖాళీగా ఉన్నాయా?')).toBe('te')
  })

  it('detects Kannada script', () => {
    expect(detectLanguage('ಆಸ್ಪತ್ರೆಯಲ್ಲಿ ಎಷ್ಟು ಹಾಸಿಗೆಗಳು ಖಾಲಿ ಇವೆ?')).toBe('kn')
  })

  it('detects Tamil script', () => {
    expect(detectLanguage('மருத்துவமனையில் எத்தனை படுக்கைகள் காலியாக உள்ளன?')).toBe('ta')
  })

  it('detects language mentions in English query', () => {
    expect(detectLanguage('respond in hindi please')).toBe('hi')
    expect(detectLanguage('please switch to telugu')).toBe('te')
  })

  it('returns null for standard English queries', () => {
    expect(detectLanguage('How many ICU beds are free right now?')).toBe(null)
  })
})
