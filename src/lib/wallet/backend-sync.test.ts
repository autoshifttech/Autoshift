import { describe, expect, it } from 'vitest'
import { balanceOf, spendByKind } from './model'
import { ledgerToTransactions, type LedgerRow } from './backend-sync'

const row = (id: number, kind: string, amount_paise: number, at = '2026-11-01T10:00:00Z'): LedgerRow => ({ id, kind, amount_paise, balance_after: 0, ref: '', created_at: at })

describe('ledgerToTransactions', () => {
  it('turns paise into rupees and charge rows into units', () => {
    const txs = ledgerToTransactions([row(3, 'charge_marketing', -29700), row(2, 'charge_ai', -50), row(1, 'topup', 100000)], 100000 - 29700 - 50)
    expect(txs.map((t) => [t.kind, t.amount, t.units])).toEqual([['marketing', -297, 300], ['ai', -0.5, 2], ['topup', 1000, 0]])
  })

  it('the balance the screens compute equals the server balance', () => {
    const rows = [row(2, 'charge_utility', -150), row(1, 'topup', 50000)]
    expect(balanceOf(ledgerToTransactions(rows, 49850))).toBe(498.5)
  })

  it('adds one "earlier" line when the list is capped, so the balance still adds up', () => {
    const txs = ledgerToTransactions([row(9, 'topup', 10000, '2026-11-03T00:00:00Z')], 35000)
    expect(txs.find((t) => t.id === 'l-earlier')).toMatchObject({ kind: 'adjustment', amount: 250, note: 'earlier' })
    expect(balanceOf(txs)).toBe(350)
  })

  it('shows staff adjustments and refunded payments as adjustments, not as spend', () => {
    const txs = ledgerToTransactions([row(2, 'refund', -5000), row(1, 'adjustment', 2000)], -3000 + 0)
    expect(txs.map((t) => [t.kind, t.note])).toEqual([['adjustment', 'refund'], ['adjustment', 'adjustment']])
    const spend = spendByKind(txs, 30, Date.parse('2026-11-02T00:00:00Z'))
    expect(Object.values(spend).every((v) => v.amount === 0)).toBe(true)
  })

  it('without a ledger (members who cannot read it) the balance is one earlier line', () => {
    const txs = ledgerToTransactions([], 7500)
    expect(txs).toHaveLength(1)
    expect(balanceOf(txs)).toBe(75)
  })
})
