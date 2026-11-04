/**
 * Admin panel state that changes as you work: plan prices, actions on
 * businesses, refunds, tickets, announcements, the admin team and the
 * audit log. Kept in this browser until the backend exists; every action
 * writes an audit entry the way the server will.
 */
import { useStore, createStore } from '@/lib/workspace/store'
import { PLANS, type PlanId } from '@/lib/billing/plans'
import { backendUrl } from '@/lib/backend/client'
import { adminBackendStore, remoteDeleteBusiness, remoteSaveTeam, remoteUpdateBusiness, useAdminBackend } from './backend-sync'
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
  /** starter / growth / pro, or a slug for a plan added in the admin. */
  id: string
  name: string
  monthly: number
  seats: number | null
  contacts: number | null
  aiReplies: number
  active: boolean
  /** Added in the admin panel; can be deleted while nobody is on it. */
  custom?: boolean
}

export interface Coupon {
  code: string
  percentOff: number
  appliesTo: 'all' | string
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
  /** Profile edits made by an admin. */
  name?: string
  industry?: string
  city?: string
  owner?: { name: string; email: string; phone: string }
  notes?: { text: string; author: string; at: string }[]
}

export type MemberRole = 'owner' | 'admin' | 'agent' | 'viewer'

/** A person with a login on a business account. */
export interface BusinessMember {
  id: string
  name: string
  email: string
  role: MemberRole
  addedAt: string
}

export interface AlertSettings {
  channels: { panel: boolean; email: boolean; whatsapp: boolean }
  destinations: { email: string; whatsapp: string }
  /** Daily summary instead of one message per alert. */
  digest: boolean
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
  /** Businesses an admin added. */
  createdBusinesses: Business[]
  /** Ids of businesses an admin deleted. */
  deletedBusinesses: string[]
  /** Team lists an admin has changed, by business id. */
  teams: Record<string, BusinessMember[]>
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
    createdBusinesses: [],
    deletedBusinesses: [],
    teams: {},
    // With a backend these come from the server (see admin-data-sync.ts).
    tickets: backendUrl() ? [] : TICKETS,
    announcements: backendUrl() ? [] : ANNOUNCEMENTS,
    team: backendUrl() ? [] : ADMIN_TEAM,
    audit: backendUrl() ? [] : AUDIT,
    alerts: {
      channels: { panel: true, email: true, whatsapp: false },
      destinations: { email: 'founder@autoshift.app', whatsapp: '' },
      digest: false,
      rules: { lowWallet: true, quality: true, paymentFailed: true, trialEnding: true, marketingSpike: true, systemDown: true },
      lowWalletBelow: 200,
    },
    dismissedAlerts: [],
    resolvedEvents: [],
    jobRuns: {},
  }
}

export const adminStore = createStore(initialAdminState, backendUrl() ? undefined : 'autoshift.admin.v2')
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
    name: o.name ?? b.name,
    industry: o.industry ?? b.industry,
    city: o.city ?? b.city,
    owner: o.owner ?? b.owner,
    status: o.status ?? b.status,
    plan: o.plan ?? b.plan,
    trialEndsAt: o.trialEndsAt ?? b.trialEndsAt,
    wallet: Math.round((b.wallet + (o.walletAdjust ?? 0)) * 100) / 100,
  }
}

export function useBusinesses(): Business[] {
  const { overrides, createdBusinesses, deletedBusinesses, teams } = useAdmin()
  const remote = useAdminBackend()
  if (backendUrl()) return remote.businesses
  return [...BUSINESSES, ...createdBusinesses]
    .filter((b) => !deletedBusinesses.includes(b.id))
    .map((b) => ({ ...applyOverride(b, overrides[b.id]), team: teams[b.id]?.length ?? b.team }))
}

/** A business by id, including ones an admin added; undefined once deleted. */
export function findBusiness(state: AdminState, id: string): Business | undefined {
  if (backendUrl()) return adminBackendStore.get().businesses.find((b) => b.id === id)
  if (state.deletedBusinesses.includes(id)) return undefined
  return [...BUSINESSES, ...state.createdBusinesses].find((b) => b.id === id)
}

export interface BusinessInput {
  name: string
  industry: string
  city: string
  owner: { name: string; email: string; phone: string }
  plan: PlanId
}

/** Adds a business on a 14-day trial with an empty workspace; returns its id. */
export function createBusiness(input: BusinessInput): string {
  const id = `biz_${Date.now().toString(36)}`
  const now = new Date().toISOString()
  const business: Business = {
    id,
    ...input,
    cycle: 'monthly',
    status: 'trial',
    createdAt: now,
    trialEndsAt: new Date(Date.now() + 14 * 864e5).toISOString(),
    renewsAt: null,
    mrr: 0,
    wallet: 0,
    team: 1,
    contacts: 0,
    whatsapp: { status: 'not_connected', number: '', displayName: '', quality: 'green', tier: '250', templatesApproved: 0, templatesRejected: 0, connectedAt: null },
    usage: { marketing: 0, utility: 0, authentication: 0, service: 0, ai: 0 },
    lastActiveAt: now,
    flags: [],
  }
  act('Created business', input.name, `Owner ${input.owner.email} · ${input.plan} plan`, (s) => ({
    createdBusinesses: [...s.createdBusinesses, business],
    teams: { ...s.teams, [id]: [{ id: `m_${id}`, name: input.owner.name, email: input.owner.email, role: 'owner', addedAt: now }] },
  }))
  return id
}

/** Removes a business and its team from the platform. */
export function deleteBusiness(b: Business): Promise<boolean> {
  if (backendUrl()) return remoteDeleteBusiness(b)
  act('Deleted business', b.name, `Owner ${b.owner.email}`, (s) => ({
    deletedBusinesses: [...s.deletedBusinesses, b.id],
    createdBusinesses: s.createdBusinesses.filter((x) => x.id !== b.id),
  }))
  return Promise.resolve(true)
}

/** The people on a business, with the admin's changes applied. */
export function teamOf(state: AdminState, b: Business): BusinessMember[] {
  if (backendUrl()) return adminBackendStore.get().teams[b.id] ?? []
  const saved = state.teams[b.id]
  if (saved) return saved
  const added = new Date(b.createdAt).toISOString()
  const first = ['Kavya', 'Rohan', 'Ananya', 'Vikram', 'Sneha', 'Rahul', 'Meera', 'Karthik']
  const list: BusinessMember[] = [{ id: `m_${b.id}_0`, name: b.owner.name, email: b.owner.email, role: 'owner', addedAt: added }]
  for (let i = 1; i < b.team; i++) {
    const n = first[(b.id.length + i * 3) % first.length]
    list.push({ id: `m_${b.id}_${i}`, name: n, email: `${n.toLowerCase()}@${b.owner.email.split('@')[1] ?? 'example.com'}`, role: i === 1 ? 'admin' : 'agent', addedAt: added })
  }
  return list
}

/** A new person for a business team. */
export function newMember(name: string, email: string, role: MemberRole): BusinessMember {
  return { id: `m_${Date.now().toString(36)}`, name, email, role, addedAt: new Date().toISOString() }
}

export function saveTeam(b: Business, team: BusinessMember[], action: string, details: string) {
  if (backendUrl()) return void remoteSaveTeam(b, team)
  act(action, b.name, details, (s) => ({ teams: { ...s.teams, [b.id]: team } }))
}

export function usePayments(): Payment[] {
  const { refunded } = useAdmin()
  const remote = useAdminBackend()
  if (backendUrl()) return remote.payments
  return PAYMENTS.map((p) => (refunded.includes(p.id) ? { ...p, status: 'refunded' as const } : p))
}

export function updateBusiness(b: Business, action: string, details: string, patch: (o: BusinessOverride) => BusinessOverride) {
  if (backendUrl()) return void remoteUpdateBusiness(b, patch({}), details)
  act(action, b.name, details, (s) => ({ overrides: { ...s.overrides, [b.id]: patch(s.overrides[b.id] ?? {}) } }))
}

export function addTicketMessage(id: string, message: TicketMessage, status?: Ticket['status']) {
  adminStore.set((s) => ({ ...s, tickets: s.tickets.map((t) => (t.id === id ? { ...t, status: status ?? t.status, messages: [...t.messages, message] } : t)) }))
}

export function updateTicket(id: string, patch: Partial<Ticket>, audit?: { action: string; details: string }) {
  const ticket = adminStore.get().tickets.find((t) => t.id === id)
  if (!ticket) return
  const change = (s: AdminState) => ({ tickets: s.tickets.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
  if (audit) act(audit.action, id, audit.details, change)
  else adminStore.set((s) => ({ ...s, ...change(s) }))
}

/** A business opens a request from the help button (the business app side of the Support inbox). */
export function createTicket(input: { businessId: string; subject: string; category: Ticket['category']; priority: Ticket['priority']; message: string; author: string }): string {
  const tickets = adminStore.get().tickets
  const next = Math.max(1040, ...tickets.map((t) => Number(t.id.replace(/\D/g, '')) || 0)) + 1
  const id = `T-${next}`
  const at = new Date().toISOString()
  adminStore.set((s) => ({
    ...s,
    tickets: [{ id, businessId: input.businessId, subject: input.subject, category: input.category, status: 'open', priority: input.priority, assignee: null, createdAt: at, messages: [{ from: 'business', author: input.author, text: input.message, at }] }, ...s.tickets],
  }))
  return id
}

/** Admin's private notes on a business: from the server when connected. */
export function notesOf(state: AdminState, id: string, remote: ReturnType<typeof useAdminBackend>) {
  return backendUrl() ? (remote.notes[id] ?? []) : (state.overrides[id]?.notes ?? [])
}
