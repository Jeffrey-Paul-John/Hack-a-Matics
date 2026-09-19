import { describe, it, expect } from 'vitest'
import {
  prepareForSpeech,
  splitIntoSentences,
  detectChunkLanguage,
  mapAppLanguageToBCP47,
  redactClientClinicalText,
} from './textPreparation'

describe('textPreparation.ts', () => {
  describe('prepareForSpeech', () => {
    it('strips markdown headers, bold, italics, and links', () => {
      const input = '### Clinical Notice\nPatient status is **CRITICAL** with *moderate* pain. [View Telemetry](http://link).'
      const output = prepareForSpeech(input, 'en-IN')
      expect(output).not.toContain('###')
      expect(output).not.toContain('**')
      expect(output).not.toContain('[')
      expect(output).not.toContain('http://link')
      expect(output).toContain('Clinical Notice')
      expect(output).toContain('Patient status is CRITICAL')
      expect(output).toContain('View Telemetry')
    })

    it('replaces markdown tables with a verbal note', () => {
      const input = `Here is the current table:
| Unit | Free |
| --- | --- |
| ICU | 4 |
End of report.`
      const output = prepareForSpeech(input, 'en-IN')
      expect(output).not.toContain('| --- |')
      expect(output).toContain('Please see the detailed table on screen.')
      expect(output).toContain('End of report.')
    })

    it('removes code blocks', () => {
      const input = 'Run this command: ```npm test``` to verify.'
      const output = prepareForSpeech(input, 'en-IN')
      expect(output).not.toContain('```')
      expect(output).toBe('Run this command: to verify.')
    })

    it('expands medical acronyms only in English without affecting internal substrings', () => {
      const input = 'The ED has 5 beds. A BED was reduced. ICU wait is 15 min with 95% compliance.'
      const outputEn = prepareForSpeech(input, 'en-IN')
      expect(outputEn).toContain('The Emergency Department has 5 beds.')
      expect(outputEn).toContain('A BED was reduced.') // "BED" and "reduced" must NOT expand "ED"
      expect(outputEn).toContain('I.C.U.')
      expect(outputEn).toContain('15 minutes')
      expect(outputEn).toContain('95 percent')

      // In Hindi, ED and min expansions should not fire
      const outputHi = prepareForSpeech('ED aur ICU beds', 'hi-IN')
      expect(outputHi).not.toContain('Emergency Department')
      expect(outputHi).toContain('ED aur ICU beds')
    })

    it('converts directional and math symbols to words', () => {
      const input = 'Triage score ≥ 80 -> ICU. Error ± 5%.'
      const output = prepareForSpeech(input, 'en-IN')
      expect(output).toContain('greater than or equal to')
      expect(output).toContain('leads to')
      expect(output).toContain('plus or minus')
    })
  })

  describe('splitIntoSentences', () => {
    it('does not split on decimal numbers', () => {
      const input = 'Observed average waiting time was 52.6 minutes. Target met rate is 94.8%.'
      const chunks = splitIntoSentences(input, 500)
      expect(chunks.length).toBe(1)
      expect(chunks[0]).toBe('Observed average waiting time was 52.6 minutes. Target met rate is 94.8%.')
    })

    it('does not split on common abbreviations', () => {
      const input = 'Dr. Sharma reported approx. 12 arrivals vs. baseline expectations. All units are stable.'
      const chunks = splitIntoSentences(input, 500)
      expect(chunks.length).toBe(1)
      expect(chunks[0]).toContain('Dr. Sharma')
    })

    it('enforces chunk limit of <= 500 characters', () => {
      const sentence = 'Operational triage efficiency under dynamic programming policy shows sustained improvement. '
      const longText = sentence.repeat(15) // ~1,400 chars
      const chunks = splitIntoSentences(longText, 500)
      expect(chunks.length).toBeGreaterThan(1)
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(500)
      }
    })
  })

  describe('redactClientClinicalText', () => {
    it('scrubs MRN, phone numbers, and DOBs', () => {
      const input = 'Admit Patient P0012 with MRN: MRN-9982, phone 9876543210, DOB: 1985-02-14.'
      const scrubbed = redactClientClinicalText(input)
      expect(scrubbed).not.toContain('P0012')
      expect(scrubbed).not.toContain('MRN-9982')
      expect(scrubbed).not.toContain('9876543210')
      expect(scrubbed).not.toContain('1985-02-14')
      expect(scrubbed).toContain('[Medical Record Number]')
      expect(scrubbed).toContain('[Contact Number]')
      expect(scrubbed).toContain('[Date of Birth]')
    })
  })

  describe('language detection and mapping', () => {
    it('maps app language codes to BCP-47', () => {
      expect(mapAppLanguageToBCP47('en')).toBe('en-IN')
      expect(mapAppLanguageToBCP47('hi')).toBe('hi-IN')
      expect(mapAppLanguageToBCP47('kn')).toBe('kn-IN')
      expect(mapAppLanguageToBCP47('unknown')).toBe('en-IN')
    })

    it('detects Devanagari script for Hindi', () => {
      expect(detectChunkLanguage('नमस्ते, क्या आप मेरी मदद कर सकते हैं?')).toBe('hi-IN')
      expect(detectChunkLanguage('Emergency bed status is clear.', 'en-IN')).toBe('en-IN')
    })
  })
})
