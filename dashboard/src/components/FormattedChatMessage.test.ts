import { describe, it, expect } from 'vitest'
import { renderInline, formatMessageText, autoBoldMetrics } from './FormattedChatMessage'

describe('FormattedChatMessage renderInline', () => {
  it('formats bold text embedded inside a sentence', () => {
    const text = 'There are currently **0 active SLA breaches**.'
    const nodes = renderInline(text, false)
    expect(nodes.length).toBe(3)
    expect(nodes[0]).toBe('There are currently ')
    expect(typeof nodes[1]).toBe('object')
    expect(nodes[2]).toBe('.')
  })

  it('formats multiple bold items in one sentence', () => {
    const text = 'Average Wait = **12.4 mins**, Completed = **42**, SLA Breaches = **0**.'
    const nodes = renderInline(text, false)
    expect(nodes.length).toBe(7)
    expect(nodes[0]).toBe('Average Wait = ')
    expect(typeof nodes[1]).toBe('object') // **12.4 mins**
    expect(nodes[2]).toBe(', Completed = ')
    expect(typeof nodes[3]).toBe('object') // **42**
    expect(nodes[4]).toBe(', SLA Breaches = ')
    expect(typeof nodes[5]).toBe('object') // **0**
    expect(nodes[6]).toBe('.')
  })

  it('handles code, italic, and bold combined in sentence', () => {
    const text = 'Check `SimulationEngine` with **high priority** and *active* status.'
    const nodes = renderInline(text, false)
    expect(nodes.length).toBe(7)
    expect(nodes[0]).toBe('Check ')
    expect(typeof nodes[1]).toBe('object') // `SimulationEngine`
    expect(nodes[2]).toBe(' with ')
    expect(typeof nodes[3]).toBe('object') // **high priority**
    expect(nodes[4]).toBe(' and ')
    expect(typeof nodes[5]).toBe('object') // *active*
    expect(nodes[6]).toBe(' status.')
  })

  it('returns plain text when no markdown is present', () => {
    const text = 'MedFlow clinical copilot is operational.'
    const nodes = renderInline(text, false)
    expect(nodes).toEqual(['MedFlow clinical copilot is operational.'])
  })
})

describe('FormattedChatMessage spacing and auto-bolding', () => {
  it('fixes squished numbers and words (5ICU -> 5 ICU)', () => {
    expect(formatMessageText('There are 5ICU beds currently free (5/5 available).')).toBe(
      'There are 5 ICU beds currently free (5/5 available).'
    )
    expect(formatMessageText('8beds and 4doctors')).toBe('8 beds and 4 doctors')
  })

  it('preserves ordinals (1st, 2nd, 3rd, 4th)', () => {
    expect(formatMessageText('1st triage patient, 2nd bed, 3rd floor, 4th case')).toBe(
      '1st triage patient, 2nd bed, 3rd floor, 4th case'
    )
  })

  it('auto-bolds unbolded clinical counts and availability ratios', () => {
    const raw = 'There are 5 ICU beds currently free (5/5 available).'
    const bolded = autoBoldMetrics(raw)
    expect(bolded).toBe('There are **5 ICU beds** currently free (**5/5 available**).')
  })

  it('does not double-wrap already bolded metrics', () => {
    const raw = 'Current queue status: **0 patients waiting (0 CRITICAL urgency)**.'
    const bolded = autoBoldMetrics(raw)
    expect(bolded).toBe('Current queue status: **0 patients waiting (0 CRITICAL urgency)**.')
  })
})
