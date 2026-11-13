import { describe, expect, it } from 'vitest'
import { BUSINESSES, PAYMENTS, usageRevenue, type Business } from './data'
import { buildAlerts } from './alerts'
import { applyOverride, initialAdminState } from './store'
import { inrShort, relTime } from './format'

const biz = (p: Partial<Business>): Business => ({
  id: 'b1', name: 'Shop', industry: '', city: '', owner: { name: 'O', email: 'o@x.in', phone: '' }, plan: 'starter', cycle: 'monthly', status: 'active',
  createdAt: '2026-01-01T00:00:00Z', trialEndsAt: '2026-01-15T00:00:00Z', renewsAt: null, mrr: 999, wallet: 500, team: 1, contacts: 0,
  whatsapp: { status: 'connected', number: '', displayName: '', quality: 'green', tier: '250', templatesApproved: 0, templatesRejected: 0, connectedAt: null },
  usage: { marketing: 0, utility: 0, authentication: 0, service: 0, ai: 0 }, lastActiveAt: '2026-01-01T00:00:00Z', flags: [], ...p,
})
const SAMPLE = [biz({}), biz({ id: 'b2', status: 'past_due' }), biz({ id: 'b3', wallet: -10 })]

describe('admin data', () => {
  it('ships no sample businesses or payments', () => {
    expect(BUSINESSES).toEqual([])
    expect(PAYMENTS).toEqual([])
  })

  it('works out margin as charged minus cost', () => {
    const r = usageRevenue({ marketing: 100, utility: 100, authentication: 0, service: 500, ai: 100 })
    expect(r.charged).toBe(Math.round(100 * 0.99 + 100 * 0.15 + 100 * 0.25))
    expect(r.margin).toBe(r.charged - r.cost)
  })
})

describe('admin alerts', () => {
  const state = initialAdminState()

  it('lists critical alerts first', () => {
    const alerts = buildAlerts(SAMPLE, state)
    const order = { critical: 0, warning: 1, info: 2 }
    for (let i = 1; i < alerts.length; i++) expect(order[alerts[i - 1].severity]).toBeLessThanOrEqual(order[alerts[i].severity])
  })

  it('hides dismissed alerts and switched-off rules', () => {
    const all = buildAlerts(SAMPLE, state)
    const first = all[0]
    expect(buildAlerts(SAMPLE, { ...state, dismissedAlerts: [first.id] }).some((a) => a.id === first.id)).toBe(false)
    const noPayments = buildAlerts(SAMPLE, { ...state, alerts: { ...state.alerts, rules: { ...state.alerts.rules, paymentFailed: false } } })
    expect(noPayments.some((a) => a.id.startsWith('p-'))).toBe(false)
  })
})

describe('admin overrides and formatting', () => {
  it('applies plan, status and wallet changes', () => {
    const b = SAMPLE[0]
    const out = applyOverride(b, { status: 'blocked', plan: 'pro', walletAdjust: 100 })
    expect(out.status).toBe('blocked')
    expect(out.plan).toBe('pro')
    expect(out.wallet).toBeCloseTo(b.wallet + 100, 2)
  })

  it('formats lakh and crore amounts', () => {
    expect(inrShort(250000)).toBe('₹2.50L')
    expect(inrShort(31000000)).toBe('₹3.10Cr')
  })

  it('describes past and future times', () => {
    const now = Date.UTC(2026, 0, 10)
    expect(relTime(new Date(now - 3 * 3600e3).toISOString(), now)).toBe('3h ago')
    expect(relTime(new Date(now + 4 * 864e5).toISOString(), now)).toBe('in 4d')
  })
})
