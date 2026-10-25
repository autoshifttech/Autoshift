import { describe, expect, it } from 'vitest'
import { BUSINESSES, PAYMENTS, seeded, usageRevenue } from './data'
import { buildAlerts } from './alerts'
import { applyOverride, initialAdminState } from './store'
import { inrShort, relTime } from './format'

describe('admin sample data', () => {
  it('is the same on every run', () => {
    const a = seeded(5)
    const b = seeded(5)
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()])
  })

  it('has unique business ids and owners for each business', () => {
    expect(new Set(BUSINESSES.map((b) => b.id)).size).toBe(BUSINESSES.length)
    for (const b of BUSINESSES) expect(b.owner.email).toMatch(/@/)
  })

  it('only charges MRR for paying businesses', () => {
    for (const b of BUSINESSES) {
      if (b.status !== 'active' && b.status !== 'past_due') expect(b.mrr).toBe(0)
      else expect(b.mrr).toBeGreaterThan(0)
    }
  })

  it('links every payment to a business and keeps refunds negative', () => {
    const ids = new Set(BUSINESSES.map((b) => b.id))
    for (const p of PAYMENTS) {
      expect(ids.has(p.businessId)).toBe(true)
      if (p.kind === 'refund') expect(p.amount).toBeLessThan(0)
    }
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
    const alerts = buildAlerts(BUSINESSES, state)
    const order = { critical: 0, warning: 1, info: 2 }
    for (let i = 1; i < alerts.length; i++) expect(order[alerts[i - 1].severity]).toBeLessThanOrEqual(order[alerts[i].severity])
  })

  it('hides dismissed alerts and switched-off rules', () => {
    const all = buildAlerts(BUSINESSES, state)
    const first = all[0]
    expect(buildAlerts(BUSINESSES, { ...state, dismissedAlerts: [first.id] }).some((a) => a.id === first.id)).toBe(false)
    const noPayments = buildAlerts(BUSINESSES, { ...state, alerts: { ...state.alerts, rules: { ...state.alerts.rules, paymentFailed: false } } })
    expect(noPayments.some((a) => a.id.startsWith('p-'))).toBe(false)
  })
})

describe('admin overrides and formatting', () => {
  it('applies plan, status and wallet changes', () => {
    const b = BUSINESSES[0]
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
