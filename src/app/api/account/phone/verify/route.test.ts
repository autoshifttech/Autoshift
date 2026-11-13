import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashCode } from '@/lib/auth/phone-otp'

const state: { pending: Record<string, unknown> | null; profileUpdate: Record<string, unknown> | null; attempts: number | null; deleted: boolean; updateError: { code: string } | null } = { pending: null, profileUpdate: null, attempts: null, deleted: false, updateError: null }

function table(name: string) {
  const q: Record<string, unknown> = {}
  const chain = () => q
  Object.assign(q, {
    select: chain,
    eq: chain,
    maybeSingle: async () => ({ data: name === 'phone_verifications' ? state.pending : { phone: null, phone_verified_at: null } }),
    update: (patch: Record<string, unknown>) => {
      if (name === 'profiles') state.profileUpdate = patch
      else state.attempts = patch.attempts as number
      return { eq: async () => ({ error: name === 'profiles' ? state.updateError : null }) }
    },
    delete: () => ({ eq: async () => ((state.deleted = true), { error: null }) }),
  })
  return q
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1', created_at: '2026-12-01T00:00:00Z' } } }) } }) }))
vi.mock('@/lib/ai/admin-client', () => ({ supabaseAdmin: () => ({ from: table }) }))

import { POST } from './route'
const req = (code: string) => new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })

describe('POST /api/account/phone/verify', () => {
  beforeEach(() => {
    state.pending = { user_id: 'u1', phone: '919876543210', code_hash: hashCode('123456', 'u1'), expires_at: new Date(Date.now() + 60_000).toISOString(), attempts: 0 }
    state.profileUpdate = null
    state.attempts = null
    state.deleted = false
    state.updateError = null
  })

  it('counts a wrong code and does not verify', async () => {
    const res = await POST(req('000000'))
    expect(res.status).toBe(400)
    expect((await res.json()).attempts_left).toBe(4)
    expect(state.attempts).toBe(1)
    expect(state.profileUpdate).toBeNull()
  })

  it('verifies the right code and clears it', async () => {
    const res = await POST(req('123456'))
    expect(res.status).toBe(200)
    expect(state.profileUpdate).toMatchObject({ phone: '919876543210' })
    expect(state.deleted).toBe(true)
  })

  it('refuses expired codes and too many attempts', async () => {
    state.pending = { ...state.pending!, expires_at: new Date(Date.now() - 1000).toISOString() }
    expect((await POST(req('123456'))).status).toBe(410)
    state.pending = { ...state.pending!, expires_at: new Date(Date.now() + 60_000).toISOString(), attempts: 5 }
    expect((await POST(req('123456'))).status).toBe(429)
    expect(state.profileUpdate).toBeNull()
  })

  it('refuses a number another account verified meanwhile', async () => {
    state.updateError = { code: '23505' }
    const res = await POST(req('123456'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('phone_taken')
  })
})
