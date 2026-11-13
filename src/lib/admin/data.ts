/**
 * Platform admin: the shapes of businesses, payments, numbers, AI usage, support tickets and the
 * admin team. There is no sample data: every list starts empty and the admin panel fills it from
 * the server (see backend-sync, admin-data-sync and live-stats).
 */
import { type BillingCycle, type PlanId } from '@/lib/billing/plans'
import { adminBackendStore } from './backend-sync'

/**
 * "Today" for the admin screens.
 */
export const ADMIN_NOW = Date.now()
const DAY = 864e5
export const daysAgo = (d: number) => new Date(ADMIN_NOW - d * DAY).toISOString()


export const INDUSTRY_LABEL: Record<string, string> = {
  clinic: 'Clinic',
  salon: 'Salon & spa',
  real_estate: 'Real estate',
  retail: 'Retail & e-commerce',
  education: 'Education',
  restaurant: 'Restaurant',
  services: 'Services',
}

export type BusinessStatus = 'trial' | 'expired' | 'active' | 'past_due' | 'cancelled' | 'blocked'
export type NumberStatus = 'connected' | 'not_connected' | 'disconnected'
export type Quality = 'green' | 'yellow' | 'red'
export const TIERS = ['250', '1K', '10K', '100K', 'Unlimited'] as const
export type Tier = (typeof TIERS)[number]

export interface Usage {
  marketing: number
  utility: number
  authentication: number
  service: number
  ai: number
}

export interface Business {
  id: string
  name: string
  industry: string
  city: string
  owner: { name: string; email: string; phone: string }
  plan: PlanId
  cycle: BillingCycle
  status: BusinessStatus
  createdAt: string
  trialEndsAt: string
  renewsAt: string | null
  /** Monthly recurring revenue from the plan, INR before GST (0 while on trial). */
  mrr: number
  wallet: number
  team: number
  contacts: number
  whatsapp: {
    status: NumberStatus
    number: string
    displayName: string
    quality: Quality
    tier: Tier
    templatesApproved: number
    templatesRejected: number
    connectedAt: string | null
    /** False when Meta's quality rating and limit aren't known (real accounts until they're read from Meta). */
    ratingKnown?: boolean
    /** Sends that failed in the last 24 hours (real accounts). */
    failed24h?: number
  }
  /** Last 30 days. */
  usage: Usage
  lastActiveAt: string
  flags: string[]
}

export const BUSINESSES: Business[] = []
/** Fixed id the business app's support screen files its own tickets under (mapped by the server). */
export const DEMO_BUSINESS_ID = 'biz_004'
/** A business by id, from the server. */
export const businessById = (id: string): Business | undefined =>
  adminBackendStore.get().businesses.find((b) => b.id === id)

/* ---------------------------------------------------------------- money */

/** What AutoShift charges vs pays Meta / the AI provider, per unit (INR). */
export const UNIT_ECONOMICS: Record<keyof Usage, { price: number; cost: number; label: string }> = {
  marketing: { price: 0.99, cost: 0.86, label: 'Marketing' },
  utility: { price: 0.15, cost: 0.13, label: 'Utility' },
  authentication: { price: 0.15, cost: 0.13, label: 'Authentication' },
  service: { price: 0, cost: 0, label: 'Service (free)' },
  ai: { price: 0.25, cost: 0.07, label: 'AI replies' },
}

export function usageRevenue(u: Usage) {
  let charged = 0
  let cost = 0
  for (const k of Object.keys(UNIT_ECONOMICS) as (keyof Usage)[]) {
    charged += u[k] * UNIT_ECONOMICS[k].price
    cost += u[k] * UNIT_ECONOMICS[k].cost
  }
  return { charged: Math.round(charged), cost: Math.round(cost), margin: Math.round(charged - cost) }
}

export type PaymentKind = 'subscription' | 'topup' | 'refund'
export type PaymentStatus = 'captured' | 'failed' | 'refunded' | 'pending'

export interface Payment {
  id: string
  razorpayId: string
  businessId: string
  kind: PaymentKind
  /** Before GST. */
  amount: number
  gst: number
  method: 'upi' | 'card' | 'netbanking' | 'auto-debit'
  status: PaymentStatus
  at: string
  invoice: string | null
  failureReason?: string
}

export const PAYMENTS: Payment[] = []

/** Twelve months of platform history, oldest first. */
export interface MonthPoint {
  month: string
  signups: number
  paying: number
  mrr: number
  subscriptions: number
  topups: number
  metaCost: number
  aiCost: number
}

export const MONTHS: MonthPoint[] = []

/* ---------------------------------------------------------- AI + system */

export const AI_MODELS = [
  { id: 'fast', label: 'AutoShift Fast', costPerReply: 0.05 },
  { id: 'smart', label: 'AutoShift Smart', costPerReply: 0.12 },
] as const

export interface AiDay {
  day: string
  fast: number
  smart: number
  errors: number
}

export const AI_DAYS: AiDay[] = []

export interface ServiceStatus {
  id: string
  name: string
  detail: string
  status: 'operational' | 'degraded' | 'down'
  uptime: number
  latencyMs: number
}

export const SERVICES: ServiceStatus[] = []

export interface Job {
  id: string
  name: string
  schedule: string
  lastRun: string
  durationS: number
  status: 'ok' | 'failed' | 'running'
}

export const JOBS: Job[] = []

export interface SystemEvent {
  id: string
  source: 'meta' | 'razorpay' | 'send' | 'ai'
  businessId: string
  message: string
  code: string
  at: string
  retries: number
  resolved: boolean
}

export const SYSTEM_EVENTS: SystemEvent[] = []

/** Webhook deliveries per hour for the last 24 hours. */
export const WEBHOOK_HOURS: { hour: string; delivered: number; failed: number }[] = []

/* --------------------------------------------------- support + people */

export type AdminRole = 'super_admin' | 'support' | 'finance'

export const ROLE_LABEL: Record<AdminRole, string> = { super_admin: 'Super admin', support: 'Support', finance: 'Finance' }

export const ROLE_ACCESS: Record<AdminRole, string[]> = {
  super_admin: ['Everything, including prices, refunds, blocking and the admin team'],
  support: ['Businesses (no money actions)', 'WhatsApp health', 'Support inbox', 'Announcements'],
  finance: ['Payments and refunds', 'Wallet and costs', 'Invoices and exports'],
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: AdminRole
  status: 'active' | 'invited' | 'disabled'
  twoFactor: boolean
  lastActiveAt: string | null
}

export const ADMIN_TEAM: AdminUser[] = []

export type TicketStatus = 'open' | 'pending' | 'closed'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface TicketMessage {
  from: 'business' | 'admin' | 'note'
  author: string
  text: string
  at: string
}

export interface Ticket {
  id: string
  businessId: string
  subject: string
  category: 'WhatsApp connection' | 'Billing' | 'Templates' | 'AI assistant' | 'Bug' | 'Other'
  status: TicketStatus
  priority: TicketPriority
  assignee: string | null
  createdAt: string
  messages: TicketMessage[]
}

export const TICKETS: Ticket[] = []

export interface Announcement {
  id: string
  title: string
  body: string
  kind: 'news' | 'maintenance' | 'banner'
  audience: 'all' | 'trial' | 'paying' | PlanId
  status: 'draft' | 'scheduled' | 'published'
  at: string
  views: number
}

export const ANNOUNCEMENTS: Announcement[] = []

export interface AuditEntry {
  id: string
  actor: string
  role: AdminRole
  action: string
  target: string
  details: string
  at: string
  ip: string
}

export const AUDIT: AuditEntry[] = []
