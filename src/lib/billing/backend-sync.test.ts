import { describe, expect, it } from 'vitest'
import { detailsFromRow, detailsToRow, toSubscription, type SubscriptionRow } from './backend-sync'

const row = (o: Partial<SubscriptionRow> = {}): SubscriptionRow => ({ plan_id: 'growth', cycle: 'monthly', status: 'active', trial_ends_at: '2026-11-10T00:00:00Z', current_period_end: '2026-12-10T00:00:00Z', cancel_at_period_end: false, ...o })

describe('toSubscription', () => {
  it('maps statuses the screens know', () => {
    expect(toSubscription(row({ status: 'trialing' })).status).toBe('trialing')
    expect(toSubscription(row()).status).toBe('active')
    expect(toSubscription(row({ status: 'past_due' })).status).toBe('active')
    expect(toSubscription(row({ status: 'expired' })).status).toBe('cancelled')
  })
  it('a subscription set to stop at the end of the period reads as cancelled but keeps its renewal date', () => {
    const s = toSubscription(row({ cancel_at_period_end: true }))
    expect(s.status).toBe('cancelled')
    expect(s.renewsAt).toBe('2026-12-10T00:00:00Z')
  })
})

describe('billing details mapping', () => {
  it('round-trips and tidies what is sent', () => {
    const d = detailsFromRow({ legal_name: 'A', has_gstin: true, gstin: '29abcde1234f1zx', state_code: '29', address: ' 1 Rd ', city: 'B', pincode: '560001', email: 'a@b.in' })
    const out = detailsToRow(d)
    expect(out.gstin).toBe('29ABCDE1234F1ZX')
    expect(out.address).toBe('1 Rd')
    expect(detailsToRow({ ...d, hasGstin: false }).gstin).toBe('')
  })
})
