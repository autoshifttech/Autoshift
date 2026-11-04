import { describe, expect, it } from 'vitest'
import { toBusiness, toStatus, type BusinessRow } from './backend-sync'

const NOW = Date.parse('2026-11-04T00:00:00Z')
const row = (o: Partial<BusinessRow> = {}): BusinessRow => ({
  id: 'b1', name: 'Shop', industry: 'retail', city: 'Pune', status: 'active', created_at: '2026-10-01T00:00:00Z',
  owner: { name: 'Asha', email: 'a@shop.in' }, members: 3, plan_id: 'growth', cycle: 'yearly', subscription_status: 'active',
  trial_ends_at: '2026-10-15T00:00:00Z', current_period_end: '2027-10-01T00:00:00Z', mrr_paise: 208250, wallet_paise: 123456,
  usage_30d: { marketing: 10, ai: 4 }, ...o,
})

describe('admin business mapping', () => {
  it('a suspended business shows as blocked whatever its plan', () => {
    expect(toStatus(row({ status: 'suspended' }), NOW)).toBe('blocked')
  })
  it('a trial past its end shows as expired', () => {
    expect(toStatus(row({ subscription_status: 'trialing', trial_ends_at: '2026-11-01T00:00:00Z' }), NOW)).toBe('expired')
    expect(toStatus(row({ subscription_status: 'trialing', trial_ends_at: '2026-11-10T00:00:00Z' }), NOW)).toBe('trial')
  })
  it('maps the other subscription states', () => {
    expect(toStatus(row({ subscription_status: 'past_due' }), NOW)).toBe('past_due')
    expect(toStatus(row({ subscription_status: 'expired' }), NOW)).toBe('cancelled')
    expect(toStatus(row({ subscription_status: null, trial_ends_at: null }), NOW)).toBe('trial')
  })
  it('converts paise to rupees and fills what the backend does not hold yet', () => {
    const b = toBusiness(row())
    expect(b).toMatchObject({ plan: 'growth', cycle: 'yearly', team: 3, mrr: 2082.5, wallet: 1234.56, owner: { name: 'Asha', email: 'a@shop.in', phone: '' } })
    expect(b.usage).toEqual({ marketing: 10, utility: 0, authentication: 0, service: 0, ai: 4 })
    expect(b.whatsapp.status).toBe('not_connected')
  })
})
