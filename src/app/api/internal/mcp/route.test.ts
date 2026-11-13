import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ai/admin-client', () => ({ supabaseAdmin: vi.fn(() => { throw new Error('db must not be touched') }) }))
vi.mock('@/app/api/whatsapp/templates/sync/route', () => ({ POST: vi.fn() }))
vi.mock('@/app/api/whatsapp/templates/submit/route', () => ({ POST: vi.fn() }))
vi.mock('@/app/api/ai/knowledge/route', () => ({ POST: vi.fn() }))

import { POST } from './route'

function req(headers: Record<string, string> = {}, body: unknown = { action: 'send' }) {
  return new Request('http://x/api/internal/mcp', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
}

describe('internal MCP bridge', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is off without a shared secret', async () => {
    vi.stubEnv('AUTOSHIFT_INTERNAL_SECRET', '')
    expect((await POST(req({ 'x-autoshift-internal': 'anything' }))).status).toBe(503)
  })

  it('refuses a missing or wrong secret before touching the database', async () => {
    vi.stubEnv('AUTOSHIFT_INTERNAL_SECRET', 'right-secret')
    expect((await POST(req())).status).toBe(401)
    expect((await POST(req({ 'x-autoshift-internal': 'wrong-secret' }))).status).toBe(401)
  })

  it('validates the body with the right secret', async () => {
    vi.stubEnv('AUTOSHIFT_INTERNAL_SECRET', 'right-secret')
    const res = await POST(req({ 'x-autoshift-internal': 'right-secret' }, { action: 'send', account_id: 'a', user_id: 'u', role: 'boss' }))
    expect(res.status).toBe(400)
  })
})
