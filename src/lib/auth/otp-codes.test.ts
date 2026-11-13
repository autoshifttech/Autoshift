import { describe, expect, it } from 'vitest'
import { checkCode, maskPhone } from './otp-codes'
import { hashCode } from './phone-otp'

function fakeDb(row: Record<string, unknown> | null) {
  const state = { row, updated: null as Record<string, unknown> | null, deleted: false }
  const q: Record<string, unknown> = {}
  const chain = () => q
  Object.assign(q, {
    select: chain,
    eq: chain,
    maybeSingle: async () => ({ data: state.row }),
    update: (patch: Record<string, unknown>) => ((state.updated = patch), q),
    delete: () => ((state.deleted = true), q),
    then: (resolve: (v: unknown) => void) => resolve({ error: null }),
  })
  return { db: { from: () => q } as never, state }
}

const row = (over: Record<string, unknown> = {}) => ({ user_id: 'u1', purpose: 'password_change', code_hash: hashCode('password_change:123456', 'u1'), expires_at: new Date(Date.now() + 60_000).toISOString(), attempts: 0, ...over })

describe('WhatsApp codes for passwords', () => {
  it('masks phone numbers', () => {
    expect(maskPhone('919876543210')).toBe('+91 •••••• 3210')
  })

  it('accepts the right code once and counts wrong ones', async () => {
    const ok = fakeDb(row())
    expect(await checkCode(ok.db, 'u1', 'password_change', '123456')).toEqual({ ok: true })
    expect(ok.state.deleted).toBe(true)

    const bad = fakeDb(row())
    expect(await checkCode(bad.db, 'u1', 'password_change', '000000')).toMatchObject({ ok: false, error: 'wrong_code', attempts_left: 4 })
    expect(bad.state.updated).toEqual({ attempts: 1 })
  })

  it('keeps purposes apart and refuses expired or worn-out codes', async () => {
    // A code issued for a password change is not a password-reset code.
    expect(await checkCode(fakeDb(row()).db, 'u1', 'password_reset', '123456')).toMatchObject({ ok: false, error: 'wrong_code' })
    expect(await checkCode(fakeDb(row({ expires_at: new Date(Date.now() - 1).toISOString() })).db, 'u1', 'password_change', '123456')).toMatchObject({ error: 'expired' })
    expect(await checkCode(fakeDb(row({ attempts: 5 })).db, 'u1', 'password_change', '123456')).toMatchObject({ error: 'too_many_attempts' })
    expect(await checkCode(fakeDb(null).db, 'u1', 'password_change', '123456')).toMatchObject({ error: 'no_code' })
    expect(await checkCode(fakeDb(row()).db, 'u1', 'password_change', '12')).toMatchObject({ error: 'invalid_code' })
  })
})
