/**
 * Wallet from the AutoShift backend (only when NEXT_PUBLIC_API_URL is set).
 * The backend keeps integer paise in an append-only ledger; the screens work in rupees.
 */
import { walletStore, type ChargeKind, type Transaction } from './model'
import { backend, BackendError, backendUrl } from '@/lib/backend/client'

export interface LedgerRow {
  id: number
  kind: string
  amount_paise: number
  balance_after: number
  ref: string
  created_at: string
}

/** Paise per unit, the same rate card the backend charges from. */
const RATE_PAISE: Record<ChargeKind, number> = { marketing: 99, utility: 15, authentication: 15, service: 0, ai: 25 }

const CHARGE = /^charge_(marketing|utility|authentication|service|ai)$/

export function ledgerToTransactions(rows: LedgerRow[], balancePaise: number): Transaction[] {
  const txs: Transaction[] = rows.map((r) => {
    const base = { id: `l-${r.id}`, amount: r.amount_paise / 100, at: r.created_at, status: 'completed' as const }
    const charge = CHARGE.exec(r.kind)
    if (charge) {
      const kind = charge[1] as ChargeKind
      const per = RATE_PAISE[kind]
      return { ...base, kind, units: per ? Math.max(1, Math.round(Math.abs(r.amount_paise) / per)) : 0, note: undefined }
    }
    if (r.kind === 'topup') return { ...base, kind: 'topup', units: 0 }
    // A hand adjustment by staff, or credits taken back for a refunded payment.
    return { ...base, kind: 'adjustment', units: 0, note: r.kind === 'refund' ? 'refund' : 'adjustment' }
  })
  // The ledger list is capped; anything older is shown as one line so the balance always adds up.
  const shown = rows.reduce((s, r) => s + r.amount_paise, 0)
  const older = balancePaise - shown
  if (older !== 0) {
    const oldest = rows.length ? rows[rows.length - 1].created_at : new Date().toISOString()
    txs.push({ id: 'l-earlier', kind: 'adjustment', amount: older / 100, units: 0, at: oldest, status: 'completed', note: 'earlier' })
  }
  return txs.sort((a, b) => b.at.localeCompare(a.at))
}

export async function loadWallet(): Promise<void> {
  const { balance_paise } = await backend<{ balance_paise: number }>('/v1/wallet')
  let rows: LedgerRow[] = []
  try {
    rows = await backend<LedgerRow[]>('/v1/wallet/ledger?limit=200')
  } catch (e) {
    // Only owners and admins can read the ledger; others still see the balance.
    if (!(e instanceof BackendError && e.status === 403)) throw e
  }
  walletStore.set((s) => ({ ...s, transactions: ledgerToTransactions(rows, balance_paise) }))
}

let started = false
export function startWalletSync() {
  if (!backendUrl() || started) return
  started = true
  loadWallet().catch(() => {
    started = false
  })
}
