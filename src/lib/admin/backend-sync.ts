/**
 * Admin businesses from the AutoShift backend (only when NEXT_PUBLIC_API_URL is set).
 * Reads the real list and team; every admin action is sent to the server, which checks the
 * admin's role, does it, and records it in the audit log. Screens then reload what changed.
 */
import { createStore, useStore } from '@/lib/workspace/store'
import { backend, backendUrl } from '@/lib/backend/client'
import { toast } from '@/lib/toast'
import type { PlanId } from '@/lib/billing/plans'
import type { Business, BusinessStatus, Payment } from './data'
import type { BusinessMember, BusinessOverride, MemberRole } from './store'

export interface BusinessRow {
  id: string
  name: string
  industry: string
  city: string
  status: 'active' | 'suspended'
  created_at: string
  owner: { name: string; email: string }
  members: number
  plan_id: PlanId | null
  cycle: 'monthly' | 'yearly' | null
  subscription_status: string | null
  trial_ends_at: string | null
  current_period_end: string | null
  mrr_paise: number
  wallet_paise: number
  usage_30d: Partial<Record<'marketing' | 'utility' | 'authentication' | 'service' | 'ai', number>>
  contacts?: number
  team?: { user_id: string; name: string; email: string; role: MemberRole }[]
  notes?: { id: number; text: string; author: string; at: string }[]
}

export function toStatus(r: Pick<BusinessRow, 'status' | 'subscription_status' | 'trial_ends_at'>, now = Date.now()): BusinessStatus {
  if (r.status === 'suspended') return 'blocked'
  switch (r.subscription_status) {
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'cancelled':
    case 'expired':
      return 'cancelled'
    default:
      return r.trial_ends_at && new Date(r.trial_ends_at).getTime() < now ? 'expired' : 'trial'
  }
}

export function toBusiness(r: BusinessRow): Business {
  const u = r.usage_30d
  return {
    id: r.id,
    name: r.name,
    industry: r.industry,
    city: r.city,
    owner: { name: r.owner.name, email: r.owner.email, phone: '' },
    plan: r.plan_id ?? 'starter',
    cycle: r.cycle ?? 'monthly',
    status: toStatus(r),
    createdAt: r.created_at,
    trialEndsAt: r.trial_ends_at ?? r.created_at,
    renewsAt: r.current_period_end,
    mrr: r.mrr_paise / 100,
    wallet: r.wallet_paise / 100,
    team: r.members,
    contacts: r.contacts ?? 0,
    // WhatsApp health comes from Meta, which is connected in a later phase.
    whatsapp: { status: 'not_connected', number: '', displayName: '', quality: 'green', tier: '250', templatesApproved: 0, templatesRejected: 0, connectedAt: null },
    usage: { marketing: u.marketing ?? 0, utility: u.utility ?? 0, authentication: u.authentication ?? 0, service: u.service ?? 0, ai: u.ai ?? 0 },
    lastActiveAt: r.created_at,
    flags: [],
  }
}

interface AdminBackendState {
  loaded: boolean
  payments: Payment[]
  businesses: Business[]
  teams: Record<string, BusinessMember[]>
  notes: Record<string, { text: string; author: string; at: string }[]>
}
const empty = (): AdminBackendState => ({ loaded: false, payments: [], businesses: [], teams: {}, notes: {} })
export const adminBackendStore = createStore<AdminBackendState>(empty)
const SERVER = empty()
export const useAdminBackend = () => useStore(adminBackendStore, SERVER)

export async function loadAdminBusinesses(): Promise<void> {
  const rows = await backend<BusinessRow[]>('/v1/platform/businesses')
  adminBackendStore.set((s) => ({ ...s, loaded: true, businesses: rows.map(toBusiness) }))
}

export interface FeedRow {
  id: string
  payment_id: string | null
  account_id: string
  kind: 'topup' | 'subscription'
  base_paise: number
  gst_paise: number
  status: Payment['status']
  at: string
  invoice: string | null
}

export const toPayment = (r: FeedRow): Payment => ({
  id: r.id,
  razorpayId: r.payment_id ?? '',
  businessId: r.account_id,
  kind: r.kind,
  amount: r.base_paise / 100,
  gst: r.gst_paise / 100,
  method: 'card', // Razorpay holds the method; it isn't copied here yet
  status: r.status,
  at: r.at,
  invoice: r.invoice,
})

export async function loadAdminPayments(): Promise<void> {
  const rows = await backend<FeedRow[]>('/v1/platform/payment-feed')
  adminBackendStore.set((s) => ({ ...s, payments: rows.map(toPayment) }))
}

/** Refund a wallet top-up through Razorpay; the credits come back out when Razorpay confirms. */
export async function remoteRefund(p: Payment, reason: string): Promise<boolean> {
  try {
    await backend(`/v1/platform/payments/${p.razorpayId}/refund`, { method: 'POST', body: { reason } })
    return true
  } catch (e) {
    fail(e)
    return false
  }
}

export async function loadAdminBusiness(id: string): Promise<void> {
  const r = await backend<BusinessRow>(`/v1/platform/businesses/${id}`)
  const biz = toBusiness(r)
  adminBackendStore.set((s) => ({
    ...s,
    businesses: s.businesses.some((b) => b.id === id) ? s.businesses.map((b) => (b.id === id ? biz : b)) : [...s.businesses, biz],
    teams: { ...s.teams, [id]: (r.team ?? []).map((m) => ({ id: m.user_id, name: m.name, email: m.email, role: m.role, addedAt: r.created_at })) },
    notes: { ...s.notes, [id]: (r.notes ?? []).map((n) => ({ text: n.text, author: n.author, at: n.at })) },
  }))
}

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'That did not work. Try again.')
const DAY = 864e5

/** Turns one admin edit (the screens' override shape) into the server calls it needs. */
export async function remoteUpdateBusiness(b: Business, patch: BusinessOverride, why: string): Promise<void> {
  try {
    const base = `/v1/platform/businesses/${b.id}`
    const profile: Record<string, string> = {}
    if (patch.name !== undefined) profile.name = patch.name
    if (patch.industry !== undefined) profile.industry = patch.industry
    if (patch.city !== undefined) profile.city = patch.city
    if (Object.keys(profile).length) await backend(base, { method: 'PATCH', body: profile })
    if (patch.status === 'blocked') await backend(`${base}/suspend`, { method: 'POST', body: { suspended: true, reason: why.slice(0, 300) } })
    else if (patch.status && b.status === 'blocked') await backend(`${base}/suspend`, { method: 'POST', body: { suspended: false } })
    if (patch.plan && patch.plan !== b.plan) await backend(`${base}/subscription`, { method: 'POST', body: { plan_id: patch.plan } })
    if (patch.trialEndsAt) {
      const from = Math.max(new Date(b.trialEndsAt).getTime(), Date.now())
      const days = Math.ceil((new Date(patch.trialEndsAt).getTime() - from) / DAY)
      if (days > 0) await backend(`${base}/subscription`, { method: 'POST', body: { extend_trial_days: Math.min(90, days) } })
    }
    if (patch.walletAdjust) {
      await backend(`/v1/platform/wallets/${b.id}/adjust`, { method: 'POST', body: { amount_paise: Math.round(patch.walletAdjust * 100), reason: why.slice(0, 200) || 'Admin adjustment', idempotency_key: crypto.randomUUID() } })
    }
    if (patch.notes?.length) await backend(`${base}/notes`, { method: 'POST', body: { text: patch.notes[0].text } })
  } catch (e) {
    fail(e)
  }
  await Promise.all([loadAdminBusinesses(), loadAdminBusiness(b.id)]).catch(fail)
}

export async function remoteCreateBusiness(input: { name: string; industry: string; city: string; owner: { name: string; email: string }; plan: PlanId }): Promise<string> {
  const made = await backend<BusinessRow>('/v1/platform/businesses', { method: 'POST', body: { name: input.name, industry: input.industry, city: input.city, owner: input.owner, plan_id: input.plan } })
  await loadAdminBusinesses()
  return made.id
}

/** True when the server deleted it (it refuses a business that has payment history). */
export async function remoteDeleteBusiness(b: Business): Promise<boolean> {
  let done = true
  try {
    await backend(`/v1/platform/businesses/${b.id}`, { method: 'DELETE' })
  } catch (e) {
    done = false
    fail(e)
  }
  await loadAdminBusinesses().catch(fail)
  return done
}

/** The screens hand over the whole new team; send only what changed. */
export async function remoteSaveTeam(b: Business, next: BusinessMember[]): Promise<void> {
  const current = adminBackendStore.get().teams[b.id] ?? []
  const base = `/v1/platform/businesses/${b.id}/team`
  try {
    for (const m of current.filter((c) => !next.some((n) => n.id === c.id))) await backend(`${base}/${m.id}`, { method: 'DELETE' })
    for (const m of next) {
      const was = current.find((c) => c.id === m.id)
      if (!was) await backend(base, { method: 'POST', body: { name: m.name, email: m.email, role: m.role === 'owner' ? 'admin' : m.role } })
      else if (was.role !== m.role) await backend(`${base}/${m.id}`, { method: 'PATCH', body: { role: m.role } })
    }
  } catch (e) {
    fail(e)
  }
  await Promise.all([loadAdminBusinesses(), loadAdminBusiness(b.id)]).catch(fail)
}

export type AdminAccess = 'checking' | 'ok' | 'denied' | 'off'
const accessStore = createStore<AdminAccess>(() => (backendUrl() ? 'checking' : 'off'))
export const useAdminAccess = () => useStore(accessStore, 'off' as AdminAccess)

let started = false
/** Checks the signed-in person really is platform staff (the server decides), then loads the businesses. */
export function startAdminSync() {
  if (!backendUrl() || started) return
  started = true
  backend<{ platform_admin: string | null }>('/v1/me').then(
    (me) => {
      if (!me.platform_admin) return accessStore.set('denied')
      accessStore.set('ok')
      loadAdminBusinesses().catch(fail)
      loadAdminPayments().catch(() => {})
      import('./admin-data-sync').then((m) => m.loadStaffData()).catch(() => {})
    },
    () => {
      started = false
      accessStore.set('denied')
    },
  )
}
