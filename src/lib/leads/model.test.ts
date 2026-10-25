import { describe, expect, it } from 'vitest'
import { PRESETS, applyPreset, defaultLeadSettings, ruleMatches, scoreLead, temperature, wantsHuman, type ScoreRule } from './model'
import { INDUSTRIES } from '@/lib/workspace/setup'

const rule = (op: ScoreRule['op'], value = '', points = 10): ScoreRule => ({ id: 'r', questionId: 'q', op, value, points })

describe('ruleMatches', () => {
  it('handles each operator', () => {
    expect(ruleMatches(rule('answered'), 'yes')).toBe(true)
    expect(ruleMatches(rule('answered'), '  ')).toBe(false)
    expect(ruleMatches(rule('equals', 'Today'), 'today')).toBe(true)
    expect(ruleMatches(rule('contains', 'birthday, anniversary'), 'Our Anniversary dinner')).toBe(true)
    expect(ruleMatches(rule('at_least', '80'), '₹95 lakh')).toBe(true)
    expect(ruleMatches(rule('at_least', '80'), '60')).toBe(false)
    expect(ruleMatches(rule('at_least', '80'), 'not sure')).toBe(false)
  })
})

describe('scoreLead', () => {
  const s = defaultLeadSettings()
  it('adds points for matching rules and clamps to 0–100', () => {
    expect(scoreLead({ name: 'Arjun', budget: '95', location: 'OMR', timeline: 'Within 1 month' }, s.rules)).toBe(100)
    expect(scoreLead({ name: 'Sara', budget: '45', timeline: '3–6 months' }, s.rules)).toBe(20)
    expect(scoreLead({}, s.rules)).toBe(0)
  })

  it('maps scores to temperatures', () => {
    expect(temperature(60, s.thresholds)).toBe('hot')
    expect(temperature(59, s.thresholds)).toBe('warm')
    expect(temperature(29, s.thresholds)).toBe('cold')
  })
})

describe('presets', () => {
  it('exist for every business type and only reference their own questions', () => {
    for (const industry of INDUSTRIES) {
      const p = PRESETS[industry]
      const ids = new Set(p.questions.map((q) => q.id))
      expect(p.questions.length).toBeGreaterThan(0)
      for (const r of p.rules) expect(ids.has(r.questionId)).toBe(true)
      if (p.valueFrom) expect(ids.has(p.valueFrom)).toBe(true)
    }
  })

  it('applies questions, rules and FAQs without sharing objects', () => {
    const s = applyPreset(defaultLeadSettings(), 'salon')
    expect(s.industry).toBe('salon')
    s.questions[0].prompt = 'changed'
    expect(PRESETS.salon.questions[0].prompt).not.toBe('changed')
  })
})

it('detects hand-off requests', () => {
  expect(wantsHuman('Can you CALL ME please', ['call me'])).toBe(true)
  expect(wantsHuman('price?', ['call me', ''])).toBe(false)
})
