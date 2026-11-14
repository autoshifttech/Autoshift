import { describe, expect, it } from 'vitest'
import { DEFAULT_OTP, hasSender, hashCode, mustVerify, newCode, newFancyCode, normalisePhone, sameHash } from './phone-otp'

describe('phone OTP helpers', () => {
  it('normalises phone numbers to E.164 digits', () => {
    expect(normalisePhone('+91 98765-43210')).toBe('919876543210')
    expect(normalisePhone('098765')).toBeNull()
    expect(normalisePhone('12345')).toBeNull()
    expect(normalisePhone('+1234567890123456')).toBeNull()
  })

  it('makes 6-digit codes and per-person hashes', () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/)
    expect(hashCode('123456', 'u1')).not.toBe(hashCode('123456', 'u2'))
    expect(sameHash(hashCode('123456', 'u1'), hashCode('123456', 'u1'))).toBe(true)
    expect(sameHash(hashCode('123456', 'u1'), hashCode('654321', 'u1'))).toBe(false)
  })

  it('makes easy 4-digit sign-up codes (ABAB, AABB or ABBA)', () => {
    for (let i = 0; i < 300; i++) {
      const c = newFancyCode()
      expect(c).toMatch(/^\d{4}$/)
      const [a, b, x, y] = c
      expect(a === b && x === y && a !== x || a === x && b === y && a !== b || a === y && b === x && a !== b).toBe(true)
    }
  })

  it('counts WhatsApp details entered directly as a sender', () => {
    expect(hasSender(DEFAULT_OTP)).toBe(false)
    expect(hasSender({ ...DEFAULT_OTP, sender_account_id: 'acc' })).toBe(true)
    expect(hasSender({ ...DEFAULT_OTP, custom_sender: { phone_number_id: '123', waba_id: '456', access_token: 'x' } })).toBe(true)
    expect(mustVerify({ ...DEFAULT_OTP, enabled: true, custom_sender: { phone_number_id: '123', waba_id: '456', access_token: 'x' } }, { created_at: '2026-11-14' }, null)).toBe(true)
  })

  it('asks only new, unverified sign-ups when switched on', () => {
    const on = { ...DEFAULT_OTP, enabled: true, sender_account_id: 'acc', required_since: '2026-11-13T00:00:00Z' }
    expect(mustVerify(DEFAULT_OTP, { created_at: '2026-12-01T00:00:00Z' }, null)).toBe(false)
    expect(mustVerify({ ...on, sender_account_id: null }, { created_at: '2026-12-01T00:00:00Z' }, null)).toBe(false)
    expect(mustVerify(on, { created_at: '2026-12-01T00:00:00Z' }, null)).toBe(true)
    expect(mustVerify(on, { created_at: '2026-01-01T00:00:00Z' }, null)).toBe(false)
    expect(mustVerify(on, { created_at: '2026-12-01T00:00:00Z' }, { phone_verified_at: '2026-12-01T00:01:00Z' })).toBe(false)
  })
})
