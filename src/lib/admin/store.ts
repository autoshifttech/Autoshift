/**
 * Admin panel state that changes as you work: plan prices, actions on
 * businesses, refunds, tickets, announcements, the admin team and the
 * audit log. Kept in this browser until the backend exists; every action
 * writes an audit entry the way the server will.
 */
import { useStore, createStore } from '@/lib/workspace/store'
import { PLANS, type PlanId } from '@/lib/billing/plans'
import {
  ADMIN_NOW,
  ADMIN_TEAM,
  ANNOUNCEMENTS,
  AUDIT,
  BUSINESSES,
  PAYMENTS,
  TICKETS,
  UNIT_ECONOMICS,
  type AdminRole,
  type AdminUser,
  type Announcement,
  type AuditEntry,
  type Business,
  type BusinessStatus,
  type Payment,
  type Ticket,
  type TicketMessage,
  type Usage,
} from './data'

export interface PlanConfig {
  id: PlanId
  name: string
  monthly: number
  seats: number | null
  contacts: number | null
  aiReplies: number
  active: boolean
}

export interface Coupon {
  code: string
  percentOff: number
  appliesTo: 'all' | PlanId
  expiresAt: string
  redemptions: number
  maxRedemptions: number | null
  active: boolean
}

export interface BusinessOverride {
  status?: BusinessStatus
  plan?: PlanId
  trialEndsAt?: string
  walletAdjust?: number
  notes?: { text: string; author: string; at: string }[]
}

export interface AlertSettings {
  channels: { panel: boolean; email: boolean; whatsapp: boolean }
  rules: Record<'lowWallet' | 'quality' | 'paymentFailed' | 'trialEnding' | 'marketingSpike' | 'systemDown', boolean>
  lowWalletBelow: number
}

export interface AdminState {
  plans: PlanConfig[]
  prices: Record<keyof Usage, number>
  trialDays: number
  minTopup: number
  coupons: Coupon[]
  overrides: Record<string, BusinessOverride>
  refunded: string[]
  tickets: Ticket[]
  announcements: Announcement[]
  team: AdminUser[]
  audit: AuditEntry[]
  alerts: AlertSettings
  dismissedAlerts: string[]
  resolvedEvents: string[]
  jobRuns: Record<string, string>
}

const NAMES: Record<PlanId, string> = { starter: 'Starter', growth: 'Growth', pro: 'Pro' }

export function initialAdminState(): AdminState {
  return {
    plans: (Object.keys(PLANS) as PlanId[]).map((id) => ({ id, name: NAMES[id], monthly: PLANS[id].monthly, seats: PLANS[id].seats, contacts: PLANS[id].contacts, aiReplies: PLANS[id].aiReplies, active: true })),
    prices: Object.fromEntries(Object.entries(UNIT_ECONOMICS).map(([k, v]) => [k, v.price])) as Record<keyof Usage, number>,
    trialDays: 14,
    minTopup: 500,
    coupons: [
      { code: 'DIWALI20', percentOff: 20, appliesTo: 'all', expiresAt: new Date(ADMIN_NOW + 11 * 864e5).toISOString(), redemptions: 9, maxRedemptions: 100, active: true },
      { code: 'CLINIC10', percentOff: 10, appliesTo: 'growth', expiresAt: new Date(ADMIN_NOW + 60 * 864e5).toISOString(), redemptions: 3, maxRedemptions: null, active: true },
      { code: 'LAUNCH50', percentOff: 50, appliesTo: 'starter', expiresAt: new Date(ADMIN_NOW - 30 * 864e5).toISOString(), redemptions: 41, maxRedemptions: 50, active: false },
    ],
    overrides: {},
    refunded: [],
    tickets: TICKETS,
    announcements: ANNOUNCEMENTS,
    team: ADMIN_TEAM,
    audit: AUDIT,
    alerts: {
      channels: { panel: true, email: true, whatsapp: false },
      rules: { lowWallet: true, quality: true, paymentFailed: true, trialEnding: true, marketingSpike: true, systemDown: true },
      lowWalletBelow: 200,
    },
    dismissedAlerts: [],
    resolvedEvents: [],
    jobRuns: {},
  }
}

export const adminStore = createStore(initialAdminState, 'autoshift.admin.v1')
const SERVER = initialAdminState()
export const useAdmin = () => useStore(adminStore, SERVER)

/** The signed-in admin for this design preview. */
export const CURRENT_ADMIN = { name: 'You', role: 'super_admin' as AdminRole }

/** Apply a change and record it in the audit log. */
export function act(action: string, target: string, details: string, change?: (s: AdminState) => Partial<AdminState>) {
  adminStore.set((s) => ({
    ...s,
    ...(change ? change(s) : {}),
    audit: [{ id: `au_${Date.now()}`, actor: CURRENT_ADMIN.name, role: CURRENT_ADMIN.role, action, target, details, at: new Date().toISOString(), ip: '49.37.12.8' }, ...s.audit],
  }))
}

/** A business with the admin's changes applied. */
export function applyOverride(b: Business, o: BusinessOverride | undefined): Business {
  if (!o) return b
  return {
    ...b,
    status: o.status ?? b.status,
    plan: o.plan ?? b.plan,
    trialEndsAt: o.trialEndsAt ?? b.trialEndsAt,
    wallet: Math.round((b.wallet + (o.walletAdjust ?? 0)) * 100) / 100,
  }
}

export function useBusinesses(): Business[] {
  const { overrides } = useAdmin()
  return BUSINESSES.map((b) => applyOverride(b, overrides[b.id]))
}

export function usePayments(): Payment[] {
  const { refunded } = useAdmin()
  return PAYMENTS.map((p) => (refunded.includes(p.id) ? { ...p, status: 'refunded' as const } : p))
}

export function updateBusiness(b: Business, action: string, details: string, patch: (o: BusinessOverride) => BusinessOverride) {
  act(action, b.name, details, (s) => ({ overrides: { ...s.overrides, [b.id]: patch(s.overrides[b.id] ?? {}) } }))
}

export function addTicketMessage(id: string, message: TicketMessage, status?: Ticket['status']) {
  adminStore.set((s) => ({ ...s, tickets: s.tickets.map((t) => (t.id === id ? { ...t, status: status ?? t.status, messages: [...t.messages, message] } : t)) }))
}
