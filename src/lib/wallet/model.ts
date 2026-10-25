/**
 * Wallet: prepaid credits that pay for Meta's WhatsApp message fees and
 * AI replies. Sample rates and transactions until billing is wired to
 * Razorpay and Meta's pricing; kept in the browser for now.
 */
import { createStore, useStore } from '@/lib/workspace/store'

export const CHARGE_KINDS = ['marketing', 'utility', 'authentication', 'service', 'ai'] as const
export type ChargeKind = (typeof CHARGE_KINDS)[number]
export type TxKind = 'topup' | 'refund' | ChargeKind

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
    if (t.kind === 'topup' || t.kind === 'refund' || t.status !== 'completed' || new Date(t.at).getTime() < since) continue
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

export function sampleTransactions(now = Date.now()): Transaction[] {
  const day = 864e5
  const txs: Transaction[] = [
    { id: 't-top-1', kind: 'topup', amount: 2000, units: 0, at: new Date(now - 27 * day).toISOString(), method: 'upi', status: 'completed' },
    { id: 't-top-2', kind: 'topup', amount: 1000, units: 0, at: new Date(now - 12 * day).toISOString(), method: 'card', status: 'completed' },
    { id: 't-top-3', kind: 'topup', amount: 500, units: 0, at: new Date(now - 3 * day).toISOString(), method: 'auto', status: 'completed', note: 'auto' },
    { id: 't-refund', kind: 'refund', amount: 12.87, units: 13, at: new Date(now - 9 * day).toISOString(), status: 'completed', note: 'failed_delivery' },
  ]
  // One charge line per category per day, like a daily statement.
  for (let d = 26; d >= 0; d--) {
    const at = (h: number) => new Date(now - d * day - h * 36e5).toISOString()
    const wave = 1 + Math.sin(d / 2.3) * 0.45
    const ai = Math.round(70 * wave)
    const service = Math.round(140 * wave)
    const utility = Math.round(25 * wave)
    const auth = d % 3 === 0 ? 6 : 2
    txs.push(
      { id: `t-ai-s-${d}`, kind: 'ai', amount: -+(ai * 0.6 * 0.25).toFixed(2), units: Math.round(ai * 0.6), assistant: 'Sales assistant', at: at(2), status: 'completed' },
      { id: `t-ai-p-${d}`, kind: 'ai', amount: -+(ai * 0.4 * 0.25).toFixed(2), units: Math.round(ai * 0.4), assistant: 'Support assistant', at: at(2.5), status: 'completed' },
      { id: `t-svc-${d}`, kind: 'service', amount: 0, units: service, at: at(3), status: 'completed' },
      { id: `t-utl-${d}`, kind: 'utility', amount: -+(utility * 0.15).toFixed(2), units: utility, at: at(4), status: 'completed' },
      { id: `t-auth-${d}`, kind: 'authentication', amount: -+(auth * 0.15).toFixed(2), units: auth, at: at(5), status: 'completed' },
    )
    if (d === 22 || d === 8) txs.push({ id: `t-mkt-${d}`, kind: 'marketing', amount: -+((d === 22 ? 1262 : 640) * 0.99).toFixed(2), units: d === 22 ? 1262 : 640, at: at(6), status: 'completed', note: d === 22 ? 'Festive sale' : 'Restock alert — linen' })
  }
  return txs.sort((a, b) => b.at.localeCompare(a.at))
}

function initialWallet(): WalletState {
  return { transactions: sampleTransactions(), autoRecharge: { enabled: true, below: 300, amount: 1000 }, lowBalanceAlert: 500 }
}

export const walletStore = createStore<WalletState>(initialWallet, 'autoshift.wallet')
const SERVER_WALLET: WalletState = { transactions: sampleTransactions(0), autoRecharge: { enabled: true, below: 300, amount: 1000 }, lowBalanceAlert: 500 }
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
