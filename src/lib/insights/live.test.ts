import { describe, expect, it, vi } from 'vitest'

const now = new Date('2026-11-13T12:00:00')
const iso = (h: number) => new Date(now.getTime() - h * 36e5).toISOString()
const tables: Record<string, Record<string, unknown>[]> = {
  conversations: [
    { id: 'c1', created_at: iso(2), ai_reply_count: 3, ai_handoff_summary: null, assigned_agent_id: null },
    { id: 'c2', created_at: iso(30), ai_reply_count: 0, ai_handoff_summary: null, assigned_agent_id: 'u1' },
  ],
  deals: [
    { id: 'd1', status: 'won', stage_id: 's2', created_at: iso(3) },
    { id: 'd2', status: 'open', stage_id: 's1', created_at: iso(5) },
  ],
  messages: [
    { conversation_id: 'c1', sender_type: 'customer', created_at: iso(2) },
    { conversation_id: 'c1', sender_type: 'bot', created_at: new Date(now.getTime() - 2 * 36e5 + 20_000).toISOString() },
  ],
  broadcasts: [{ name: 'Diwali', template_name: 'promo', sent_count: 100, read_count: 50, replied_count: 10, created_at: iso(10) }],
  ai_usage_log: [{ id: 'a1' }, { id: 'a2' }],
  assistants: [{ name: 'Sales bot', enabled: true }],
  pipeline_stages: [{ id: 's1', position: 0 }, { id: 's2', position: 1 }],
  message_templates: [{ name: 'promo', category: 'Marketing' }],
}

function query(table: string) {
  let head = false
  const q = {
    select: (_: string, opts?: { head?: boolean }) => ((head = !!opts?.head), q),
    gte: () => q, lt: () => q, limit: () => q, order: () => q, eq: () => q, in: () => q,
    then: (resolve: (v: unknown) => void) => resolve(head ? { count: table === 'ai_usage_log' ? 2 : 1, data: null, error: null } : { data: tables[table] ?? [], error: null }),
  }
  return q
}
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: (t: string) => query(t) }) }))

import { loadLiveInsights } from './live'

describe('loadLiveInsights', () => {
  it('works out the numbers from the account rows', async () => {
    const d = await loadLiveInsights(7, now)
    expect(d.days).toHaveLength(7)
    expect(d.totals.conversations).toBe(2)
    expect(d.totals.leads).toBe(2)
    expect(d.totals.medianReplySec).toBe(20)
    expect(d.funnel.map((f) => f.value)).toEqual([2, 2, 1, 1])
    expect(d.assistants[0]).toMatchObject({ name: 'Sales bot', replies: 2, handoffs: 0 })
    expect(d.campaigns[0]).toMatchObject({ name: 'Diwali', sent: 100, read: 50, replied: 10, cost: 99 })
    expect(d.sources).toEqual([])
    expect(d.heat.flat().reduce((a, b) => a + b, 0)).toBe(1)
  })
})
