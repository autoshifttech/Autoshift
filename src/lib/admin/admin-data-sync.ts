/**
 * Support inbox, announcements, the admin team and the audit log from the AutoShift backend
 * (only when NEXT_PUBLIC_API_URL is set). Loaded into the admin store the screens already read;
 * every change goes to the server, which checks the role and writes the audit log itself.
 */
import { backend, backendUrl } from '@/lib/backend/client'
import { toast } from '@/lib/toast'
import type { AdminRole, AdminUser, Announcement, AuditEntry, Ticket } from './data'
import { adminStore } from './store'

export interface TicketRow {
  id: string
  number: number
  account_id: string
  subject: string
  category: Ticket['category']
  priority: Ticket['priority']
  status: Ticket['status']
  assignee: string | null
  created_at: string
  messages: { from: 'business' | 'admin' | 'note'; author: string; text: string; at: string }[]
}

export const toTicket = (r: TicketRow, businessId = r.account_id): Ticket => ({
  id: r.id,
  businessId,
  subject: r.subject,
  category: r.category,
  status: r.status,
  priority: r.priority,
  assignee: r.assignee,
  createdAt: r.created_at,
  messages: r.messages.map((m) => ({ from: m.from, author: m.author, text: m.text, at: m.at })),
})

export interface AnnouncementRow {
  id: string
  title: string
  body: string
  kind: Announcement['kind']
  audience: Announcement['audience']
  draft: boolean
  publish_at: string
  views: number
}
export const toAnnouncement = (r: AnnouncementRow, now = Date.now()): Announcement => ({
  id: r.id,
  title: r.title,
  body: r.body,
  kind: r.kind,
  audience: r.audience,
  status: r.draft ? 'draft' : new Date(r.publish_at).getTime() > now ? 'scheduled' : 'published',
  at: r.publish_at,
  views: r.views,
})

interface AdminRow {
  user_id: string
  role: AdminRole | 'read_only'
  name: string
  email: string
}
const toAdmin = (r: AdminRow): AdminUser => ({ id: r.user_id, name: r.name || r.email, email: r.email, role: r.role === 'read_only' ? 'support' : r.role, status: 'active', twoFactor: false, lastActiveAt: null })

interface AuditRow {
  id: number
  actor_id: string | null
  scope: string
  action: string
  target: string
  details: Record<string, unknown>
  created_at: string
}
/** "business.suspend" -> "Business suspend"; details become one readable line. */
export function toAudit(r: AuditRow, people: Map<string, AdminUser>): AuditEntry {
  const who = r.actor_id ? people.get(r.actor_id) : undefined
  const words = r.action.replace(/[._]/g, ' ')
  return {
    id: `au_${r.id}`,
    actor: who?.name ?? (r.actor_id ? (r.scope === 'account' ? 'Business user' : 'Staff') : 'System'),
    role: who?.role ?? 'support',
    action: words.charAt(0).toUpperCase() + words.slice(1),
    target: r.target,
    details: Object.entries(r.details ?? {})
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · '),
    at: r.created_at,
    ip: '',
  }
}

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'That did not work. Try again.')

export async function loadStaffData(): Promise<void> {
  const [tickets, anns, team, audit] = await Promise.all([
    backend<TicketRow[]>('/v1/platform/tickets'),
    backend<AnnouncementRow[]>('/v1/platform/announcements'),
    backend<AdminRow[]>('/v1/platform/admins'),
    backend<AuditRow[]>('/v1/platform/audit?limit=300'),
  ])
  const people = new Map(team.map((a) => [a.user_id, toAdmin(a)]))
  adminStore.set((s) => ({ ...s, tickets: tickets.map((t) => toTicket(t)), announcements: anns.map((a) => toAnnouncement(a)), team: team.map(toAdmin), audit: audit.map((a) => toAudit(a, people)) }))
  await loadPlansAndRates().catch(() => {})
}

interface PlanRow {
  id: string
  name: string
  monthly_paise: number
  seats: number | null
  contacts: number | null
  ai_replies: number
  active: boolean
}
const RATE_KEYS = ['marketing', 'utility', 'authentication', 'service', 'ai'] as const

/** The real plans and the wallet rate card (rupees), replacing the built-in defaults. */
export async function loadPlansAndRates(): Promise<void> {
  const [plans, rates] = await Promise.all([backend<PlanRow[]>('/v1/platform/plans'), backend<{ rates_paise: Record<string, number> }>('/v1/platform/rates')])
  adminStore.set((s) => ({
    ...s,
    plans: plans.map((p) => ({ id: p.id, name: p.name, monthly: p.monthly_paise / 100, seats: p.seats, contacts: p.contacts, aiReplies: p.ai_replies, active: p.active })),
    prices: { ...s.prices, ...Object.fromEntries(RATE_KEYS.map((k) => [k, (rates.rates_paise[`charge_${k}`] ?? 0) / 100])) },
  }))
}

/** Saves a plan's price and limits on the server (super admins). */
export async function savePlan(p: { id: string; name: string; monthly: number; seats: number | null; contacts: number | null; aiReplies: number; active: boolean }): Promise<void> {
  try {
    await backend(`/v1/platform/plans/${p.id}`, {
      method: 'PATCH',
      body: { name: p.name, monthly_paise: Math.round(p.monthly * 100), seats: p.seats ?? undefined, ...(p.contacts === null ? { unlimited_contacts: true } : { contacts: p.contacts }), ai_replies: p.aiReplies, active: p.active },
    })
  } catch (e) {
    fail(e)
  }
  await loadPlansAndRates().catch(fail)
}

/** Saves the wallet rate card on the server (super admins). Prices are in rupees. */
export async function saveRates(prices: Partial<Record<(typeof RATE_KEYS)[number], number>>): Promise<void> {
  try {
    await backend('/v1/platform/rates', { method: 'PUT', body: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, Math.round((v ?? 0) * 100)])) })
  } catch (e) {
    fail(e)
  }
  await loadPlansAndRates().catch(fail)
}

const reload = () => loadStaffData().catch(fail)
const run = async (fn: () => Promise<unknown>) => {
  try {
    await fn()
    await reload()
    return true
  } catch (e) {
    fail(e)
    return false
  }
}
const num = (id: string) => id.replace(/^T-/, '')

export const staffReply = (ticketId: string, text: string, opts: { note?: boolean; close?: boolean }) => run(() => backend(`/v1/platform/tickets/${num(ticketId)}/messages`, { method: 'POST', body: { text, note: !!opts.note, close: !!opts.close } }))
export const patchTicket = (ticketId: string, patch: Partial<Pick<Ticket, 'status' | 'priority' | 'assignee'>>) => run(() => backend(`/v1/platform/tickets/${num(ticketId)}`, { method: 'PATCH', body: patch }))

export function saveAnnouncement(a: { id?: string; title: string; body: string; kind: Announcement['kind']; audience: Announcement['audience']; status: Announcement['status']; at: string }) {
  const body = { title: a.title, body: a.body, kind: a.kind, audience: a.audience, draft: a.status === 'draft', publish_at: a.at }
  return run(() => (a.id ? backend(`/v1/platform/announcements/${a.id}`, { method: 'PATCH', body }) : backend('/v1/platform/announcements', { method: 'POST', body })))
}
export const setAnnouncementDraft = (id: string, draft: boolean) => run(() => backend(`/v1/platform/announcements/${id}`, { method: 'PATCH', body: draft ? { draft: true } : { draft: false, publish_at: new Date().toISOString() } }))
export const deleteAnnouncement = (id: string) => run(() => backend(`/v1/platform/announcements/${id}`, { method: 'DELETE' }))

export const inviteAdmin = (name: string, email: string, role: AdminRole) => run(() => backend('/v1/platform/admins', { method: 'POST', body: { name, email, role } }))
export const setAdminRole = (id: string, role: AdminRole) => run(() => backend(`/v1/platform/admins/${id}`, { method: 'PATCH', body: { role } }))
export const removeAdmin = (id: string) => run(() => backend(`/v1/platform/admins/${id}`, { method: 'DELETE' }))

// ------------------------------------------------------------ business side

/** The business sees its own tickets; they are filed under the id the support screen already filters by. */
export async function loadMyTickets(screenBusinessId: string): Promise<void> {
  const rows = await backend<TicketRow[]>('/v1/support/tickets')
  adminStore.set((s) => ({ ...s, tickets: rows.map((t) => toTicket(t, screenBusinessId)) }))
}

export async function openTicket(screenBusinessId: string, input: { subject: string; category: Ticket['category']; priority: Ticket['priority']; message: string }): Promise<string> {
  const made = await backend<TicketRow>('/v1/support/tickets', { method: 'POST', body: input })
  await loadMyTickets(screenBusinessId)
  return made.id
}

export async function businessReply(screenBusinessId: string, ticketId: string, text: string): Promise<void> {
  await backend(`/v1/support/tickets/${num(ticketId)}/messages`, { method: 'POST', body: { text } })
  await loadMyTickets(screenBusinessId)
}

export const connected = () => backendUrl() !== null
