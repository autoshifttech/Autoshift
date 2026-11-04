import { describe, expect, it } from 'vitest'
import { toAnnouncement, toAudit, toTicket } from './admin-data-sync'

describe('admin data mapping', () => {
  it('announcement status comes from draft and publish time', () => {
    const base = { id: 'a', title: 't', body: '', kind: 'news' as const, audience: 'all' as const, views: 0 }
    const now = Date.parse('2026-11-04T00:00:00Z')
    expect(toAnnouncement({ ...base, draft: true, publish_at: '2026-11-01T00:00:00Z' }, now).status).toBe('draft')
    expect(toAnnouncement({ ...base, draft: false, publish_at: '2026-12-01T00:00:00Z' }, now).status).toBe('scheduled')
    expect(toAnnouncement({ ...base, draft: false, publish_at: '2026-11-01T00:00:00Z' }, now).status).toBe('published')
  })
  it('audit rows read as sentences with the staff name', () => {
    const people = new Map([['u1', { id: 'u1', name: 'Deepa', email: 'd@a.in', role: 'support' as const, status: 'active' as const, twoFactor: false, lastActiveAt: null }]])
    const e = toAudit({ id: 7, actor_id: 'u1', scope: 'platform', action: 'business.suspend', target: 'b1', details: { reason: 'spam' }, created_at: '2026-11-04T00:00:00Z' }, people)
    expect(e).toMatchObject({ id: 'au_7', actor: 'Deepa', role: 'support', action: 'Business suspend', details: 'reason: spam' })
    expect(toAudit({ id: 8, actor_id: null, scope: 'platform', action: 'payment.amount_mismatch', target: 'x', details: {}, created_at: '' }, people).actor).toBe('System')
  })
  it('tickets keep their messages in order and can be filed under the screen id', () => {
    const t = toTicket({ id: 'T-1041', number: 1041, account_id: 'acct', subject: 's', category: 'Bug', priority: 'high', status: 'open', assignee: null, created_at: 'x', messages: [{ from: 'business', author: 'A', text: '1', at: 'a' }, { from: 'admin', author: 'B', text: '2', at: 'b' }] }, 'biz_004')
    expect(t.businessId).toBe('biz_004')
    expect(t.messages.map((m) => m.text)).toEqual(['1', '2'])
  })
})
