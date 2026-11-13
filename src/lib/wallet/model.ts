/**
 * Wallet: prepaid credits that pay for Meta's WhatsApp message fees and
 * AI replies. Sample rates and transactions until billing is wired to
 * Razorpay and Meta's pricing; kept in the browser for now.
 */
import { createStore, useStore } from '@/lib/workspace/store'

export const CHARGE_KINDS = ['marketing', 'utility', 'authentication', 'service', 'ai'] as const
export type ChargeKind = (typeof CHARGE_KINDS)[number]
export type TxKind = 'topup' | 'refund' | 'adjustment' | ChargeKind

/** Price per unit in INR: one message for Meta categories, one reply for AI. Sample values. */
export interface Rate {
  kind: ChargeKind
  metaRate: number
  price: number
}

/** Sample per-message rates for India (Meta's base rate, and what the customer pays incl. margin). */
export const RATES: Rate[] = [
  { kind: 'marketing', metaRate: 0.86, price: 0.99 },
  { kind: 'utility', metaRate: 0.13, price: 0.15 },
  { kind: 'authentication', metaRate: 0.13, price: 0.15 },
  { kind: 'service', metaRate: 0, price: 0 },
  { kind: 'ai', metaRate: 0, price: 0.25 },
]

export const MIN_TOPUP = 500
export const TOPUP_PRESETS = [500, 1000, 2000, 5000]
export const GST_RATE = 0.18

export interface Transaction {
  id: string
  kind: TxKind
  /** Positive = credit (top-up, refund); negative = charge. */
  amount: number
  /** Messages or AI replies the charge covers. */
  units: number
  /** For AI charges: which assistant. */
  assistant?: string
  note?: string
  at: string
  method?: 'upi' | 'card' | 'netbanking' | 'auto'
  status: 'completed' | 'pending' | 'failed'
}

export interface WalletState {
  transactions: Transaction[]
  autoRecharge: { enabled: boolean; below: number; amount: number }
  lowBalanceAlert: number
}

export const balanceOf = (txs: Transaction[]) =>
  Math.round(txs.filter((t) => t.status === 'completed').reduce((sum, t) => sum + t.amount, 0) * 100) / 100

export function spendByKind(txs: Transaction[], days = 30, now = Date.now()): Record<ChargeKind, { amount: number; units: number }> {
  const since = now - days * 864e5
  const out = Object.fromEntries(CHARGE_KINDS.map((k) => [k, { amount: 0, units: 0 }])) as Record<ChargeKind, { amount: number; units: number }>
  for (const t of txs) {
    if (t.kind === 'topup' || t.kind === 'refund' || t.kind === 'adjustment' || t.status !== 'completed' || new Date(t.at).getTime() < since) continue
    const k = t.kind as ChargeKind
    out[k].amount += -t.amount
    out[k].units += t.units
  }
  for (const k of CHARGE_KINDS) out[k].amount = Math.round(out[k].amount * 100) / 100
  return out
}

export function aiSpendByAssistant(txs: Transaction[], days = 30, now = Date.now()): { assistant: string; amount: number; units: number }[] {
  const since = now - days * 864e5
  const map = new Map<string, { amount: number; units: number }>()
  for (const t of txs) {
    if (t.kind !== 'ai' || t.status !== 'completed' || new Date(t.at).getTime() < since) continue
    const key = t.assistant ?? '—'
    const cur = map.get(key) ?? { amount: 0, units: 0 }
    map.set(key, { amount: cur.amount - t.amount, units: cur.units + t.units })
  }
  return [...map.entries()].map(([assistant, v]) => ({ assistant, amount: Math.round(v.amount * 100) / 100, units: v.units })).sort((a, b) => b.amount - a.amount)
}

/** Average daily spend over the window, and how many days the balance lasts at that pace. */
export function runway(txs: Transaction[], days = 14, now = Date.now()): { perDay: number; daysLeft: number | null } {
  const spend = Object.values(spendByKind(txs, days, now)).reduce((s, v) => s + v.amount, 0)
  const perDay = spend / days
  const balance = balanceOf(txs)
  return { perDay: Math.round(perDay * 100) / 100, daysLeft: perDay > 0 ? Math.max(0, Math.floor(balance / perDay)) : null }
}

export function withGst(amount: number) {
  const gst = Math.round(amount * GST_RATE * 100) / 100
  return { subtotal: amount, gst, total: Math.round((amount + gst) * 100) / 100 }
}


function initialWallet(): WalletState {
  // The real ledger fills this in from the server as soon as it loads.
  return { transactions: [], autoRecharge: { enabled: true, below: 300, amount: 1000 }, lowBalanceAlert: 500 }
}

// v2: older browsers may still hold sample transactions under the old key.
export const walletStore = createStore<WalletState>(initialWallet, 'autoshift.wallet.v2')
const SERVER_WALLET: WalletState = initialWallet()
export const useWallet = () => useStore(walletStore, SERVER_WALLET)

export function topUp(amount: number, method: Transaction['method']) {
  walletStore.set((s) => ({
    ...s,
    transactions: [{ id: `t-${Date.now()}`, kind: 'topup', amount, units: 0, at: new Date().toISOString(), method, status: 'completed' }, ...s.transactions],
  }))
}

export function formatMoney(amount: number, locale = 'en-IN', fraction = 2) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', minimumFractionDigits: fraction, maximumFractionDigits: fraction }).format(amount)
}
