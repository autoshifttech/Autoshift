import { beforeEach, describe, expect, it, vi } from 'vitest'

const issued: string[] = []
vi.mock('../password-reset/shared', () => ({ userIdForEmail: async (e: string) => (e === 'known@x.in' ? 'u1' : null) }))
vi.mock('@/lib/ai/admin-client', () => ({ supabaseAdmin: () => ({}) }))
vi.mock('@/lib/auth/otp-codes', () => ({
  MIN_PASSWORD: 8,
  codesAvailable: async () => true,
  issueCode: async (_db: unknown, id: string) => (issued.push(id), { ok: true }),
  checkCode: async () => ({ ok: true }),
  setPassword: async () => null,
}))

import { POST as start } from './start/route'
import { POST as finish } from './finish/route'
import { __resetRateLimitForTests } from '@/lib/rate-limit'

const req = (body: unknown, ip = '1.1.1.1') => new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) })

describe('forgot password with a WhatsApp code', () => {
  beforeEach(() => {
    issued.length = 0
    __resetRateLimitForTests()
  })

  it('answers the same for known and unknown emails', async () => {
    const a = await start(req({ email: 'known@x.in' }))
    const b = await start(req({ email: 'nobody@x.in' }, '2.2.2.2'))
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(await a.json()).toEqual(await b.json())
    expect(issued).toEqual(['u1'])
  })

  it('rejects weak passwords and treats unknown emails like a wrong code', async () => {
    expect((await finish(req({ email: 'known@x.in', code: '123456', password: 'short' }))).status).toBe(400)
    const unknown = await finish(req({ email: 'nobody@x.in', code: '123456', password: 'long enough pw' }))
    expect(unknown.status).toBe(400)
    expect((await unknown.json()).error).toBe('wrong_code')
    expect((await finish(req({ email: 'known@x.in', code: '123456', password: 'long enough pw' }))).status).toBe(200)
  })

  it('limits tries per email', async () => {
    for (let i = 0; i < 3; i++) expect((await start(req({ email: 'known@x.in' }, `9.9.9.${i}`))).status).toBe(200)
    expect((await start(req({ email: 'known@x.in' }, '9.9.9.9'))).status).toBe(429)
  })
})
