import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, classifyReply, excludedPhones, isValidPhone, phoneKey } from './model'

describe('consent replies', () => {
  it('treats STOP keywords as opt-outs whatever the case or punctuation', () => {
    expect(classifyReply('stop', DEFAULT_SETTINGS)).toBe('opt_out')
    expect(classifyReply(' Stop all! ', DEFAULT_SETTINGS)).toBe('opt_out')
    expect(classifyReply('UNSUBSCRIBE.', DEFAULT_SETTINGS)).toBe('opt_out')
  })

  it('treats START keywords as opt-ins', () => {
    expect(classifyReply('Start', DEFAULT_SETTINGS)).toBe('opt_in')
  })

  it('ignores normal messages that only contain a keyword', () => {
    expect(classifyReply('please stop calling me after 6pm, is the shop open?', DEFAULT_SETTINGS)).toBeNull()
    expect(classifyReply('', DEFAULT_SETTINGS)).toBeNull()
  })
})

describe('who to skip', () => {
  it('skips blocked numbers and the latest opt-out per number', () => {
    const skip = excludedPhones({
      blocked: [{ phone: '+91 70000 12345', name: '', reason: '', at: '2026-01-01' }],
      records: [
        { id: 'a', name: '', phone: '+91 98450 22113', status: 'opted_in', source: 'website', evidence: '', at: '2026-01-01' },
        { id: 'b', name: '', phone: '919845022113', status: 'opted_out', source: 'keyword', evidence: 'STOP', at: '2026-02-01' },
        { id: 'c', name: '', phone: '+91 90000 00001', status: 'opted_out', source: 'keyword', evidence: 'STOP', at: '2026-01-01' },
        { id: 'd', name: '', phone: '+91 90000 00001', status: 'opted_in', source: 'keyword', evidence: 'START', at: '2026-03-01' },
      ],
    })
    expect(skip.has(phoneKey('+91 70000 12345'))).toBe(true)
    expect(skip.has(phoneKey('+91 98450 22113'))).toBe(true)
    expect(skip.has(phoneKey('+91 90000 00001'))).toBe(false)
  })

  it('checks phone numbers', () => {
    expect(isValidPhone('+91 98765 43210')).toBe(true)
    expect(isValidPhone('12345')).toBe(false)
  })
})
