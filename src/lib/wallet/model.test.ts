import { describe, expect, it } from 'vitest'
import { aiSpendByAssistant, balanceOf, runway, sampleTransactions, spendByKind, withGst, type Transaction } from './model'

const NOW = new Date('2026-10-25T12:00:00Z').getTime()
const tx = (p: Partial<Transaction>): Transaction => ({ id: Math.random().toString(), kind: 'ai', amount: 0, units: 0, at: new Date(NOW - 864e5).toISOString(), status: 'completed', ...p })

describe('wallet', () => {
  it('sums completed transactions only', () => {
    expect(balanceOf([tx({ kind: 'topup', amount: 1000 }), tx({ amount: -2.5 }), tx({ kind: 'topup', amount: 500, status: 'failed' })])).toBe(997.5)
  })

  it('groups spend by kind inside the window', () => {
    const s = spendByKind([tx({ kind: 'ai', amount: -5, units: 20 }), tx({ kind: 'marketing', amount: -9.9, units: 10 }), tx({ kind: 'ai', amount: -1, units: 4, at: new Date(NOW - 40 * 864e5).toISOString() })], 30, NOW)
    expect(s.ai).toEqual({ amount: 5, units: 20 })
    expect(s.marketing.units).toBe(10)
  })

  it('splits AI spend by assistant', () => {
    const rows = aiSpendByAssistant([tx({ amount: -3, units: 12, assistant: 'Sales' }), tx({ amount: -1, units: 4, assistant: 'Support' }), tx({ amount: -2, units: 8, assistant: 'Sales' })], 30, NOW)
    expect(rows[0]).toEqual({ assistant: 'Sales', amount: 5, units: 20 })
  })

  it('estimates days left from recent spend', () => {
    const r = runway([tx({ kind: 'topup', amount: 140 }), tx({ amount: -14, units: 56 })], 14, NOW)
    expect(r.perDay).toBe(1)
    expect(r.daysLeft).toBe(126)
    expect(runway([tx({ kind: 'topup', amount: 10 })], 14, NOW).daysLeft).toBeNull()
  })

  it('adds 18% GST and keeps a positive sample balance', () => {
    expect(withGst(1000)).toEqual({ subtotal: 1000, gst: 180, total: 1180 })
    expect(balanceOf(sampleTransactions(NOW))).toBeGreaterThan(0)
  })
})
