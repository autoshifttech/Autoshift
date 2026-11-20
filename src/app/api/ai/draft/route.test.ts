import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  assistants: [] as { id: string; enabled: boolean }[],
  draft: vi.fn(),
}))

function table(name: string) {
  const rows = name === 'assistants' ? h.assistants : name === 'conversations' ? [{ id: 'c1', contact_id: 'ct1' }] : []
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: () => Promise.resolve({ data: rows, error: null }),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
  }
  return q
}

vi.mock('@/lib/auth/account', () => ({
  requireRole: async () => ({ supabase: { from: table }, accountId: 'acct-1', userId: 'u1' }),
  toErrorResponse: (e: unknown) => new Response(String(e), { status: 500 }),
}))
vi.mock('@/lib/ai/context', () => ({
  buildConversationContext: async () => [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello!' },
    { role: 'user', content: 'Price of P001?' },
  ],
}))
vi.mock('@/lib/backend/internal', () => ({ internalConfigured: () => true, assistantDraft: h.draft }))

import { POST } from './route'

const call = () => POST(new Request('http://x/api/ai/draft', { method: 'POST', body: JSON.stringify({ conversation_id: 'c1' }) }))

beforeEach(() => {
  h.draft.mockReset()
  h.assistants = [{ id: 'a-off', enabled: false }, { id: 'a-on', enabled: true }]
})

describe('✨ draft with the AI assistant', () => {
  it('drafts with the switched-on assistant and the latest customer message', async () => {
    h.draft.mockResolvedValue({ status: 'reply', text: ' P001 is ₹499. ', reason: '' })
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ draft: 'P001 is ₹499.' })
    expect(h.draft).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'acct-1', assistantId: 'a-on', message: 'Price of P001?', contactId: 'ct1',
      history: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello!' }],
    }))
  })

  it('says what is wrong instead of a generic failure', async () => {
    h.draft.mockResolvedValue({ status: 'no_funds', text: '', reason: '' })
    const res = await call()
    expect(res.status).toBe(402)
    expect((await res.json()).code).toBe('no_funds')
    h.assistants = []
    const none = await call()
    expect((await none.json()).code).toBe('no_assistant')
  })

  it('reports an unreachable AI service', async () => {
    h.draft.mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(502)
  })
})
