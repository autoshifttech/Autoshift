/**
 * Platform admin: sample data for every business on AutoShift, their
 * payments, numbers, AI usage, support tickets and the admin team. It is
 * generated from a fixed seed so every screen (and test) sees the same
 * numbers, until the admin panel reads Supabase, Meta and Razorpay.
 */
import { PLANS, type BillingCycle, type PlanId } from '@/lib/billing/plans'

/** "Today" for the sample data, so relative dates stay stable. */
export const ADMIN_NOW = Date.UTC(2026, 9, 25, 10, 30)
const DAY = 864e5
export const daysAgo = (d: number) => new Date(ADMIN_NOW - d * DAY).toISOString()

/** Small seeded random generator (mulberry32): same seed, same data. */
export function seeded(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
    chance: (p: number) => next() < p,
  }
}

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
  }
  /** Last 30 days. */
  usage: Usage
  lastActiveAt: string
  flags: string[]
}

const NAMES: [string, string, string][] = [
  ['Smile Dental Care', 'clinic', 'Chennai'],
  ['Glow Beauty Studio', 'salon', 'Bengaluru'],
  ['Prime Homes Realty', 'real_estate', 'Pune'],
  ['Olive & Thread', 'retail', 'Jaipur'],
  ['BrightPath Academy', 'education', 'Hyderabad'],
  ['Spice Route Kitchen', 'restaurant', 'Kochi'],
  ['FixIt Home Services', 'services', 'Mumbai'],
  ['CarePlus Physio', 'clinic', 'Delhi'],
  ['Urban Cuts Salon', 'salon', 'Mumbai'],
  ['Skyline Properties', 'real_estate', 'Gurugram'],
  ['Kaveri Handlooms', 'retail', 'Mysuru'],
  ['Little Stars Preschool', 'education', 'Chennai'],
  ['Tandoor Tales', 'restaurant', 'Lucknow'],
  ['SparkClean Services', 'services', 'Bengaluru'],
  ['Healing Hands Clinic', 'clinic', 'Kolkata'],
  ['Bloom Bridal Studio', 'salon', 'Ahmedabad'],
  ['Nest Realty', 'real_estate', 'Bengaluru'],
  ['Desi Kart', 'retail', 'Surat'],
  ['MathMinds Tuition', 'education', 'Pune'],
  ['Coastal Bites', 'restaurant', 'Goa'],
  ['Swift Movers', 'services', 'Delhi'],
  ['Vision Eye Centre', 'clinic', 'Coimbatore'],
  ['The Nail Bar', 'salon', 'Hyderabad'],
  ['Greenfield Estates', 'real_estate', 'Chennai'],
  ['Silk & Saree House', 'retail', 'Varanasi'],
  ['CodeCamp Kids', 'education', 'Bengaluru'],
  ['Biryani Junction', 'restaurant', 'Hyderabad'],
  ['PestAway', 'services', 'Chennai'],
  ['Sunrise Diagnostics', 'clinic', 'Nagpur'],
  ['Mane Street Salon', 'salon', 'Pune'],
  ['Harbour View Homes', 'real_estate', 'Mumbai'],
  ['Craft Corner', 'retail', 'Kolkata'],
  ['Fluent English Hub', 'education', 'Delhi'],
  ['Chai & Chaat Co.', 'restaurant', 'Jaipur'],
  ['AquaFix Plumbers', 'services', 'Pune'],
  ['Little Feet Paediatrics', 'clinic', 'Bengaluru'],
  ['Zen Spa & Wellness', 'salon', 'Goa'],
  ['UrbanNest Rentals', 'real_estate', 'Hyderabad'],
  ['Footwear Factory', 'retail', 'Agra'],
  ['Rhythm Dance Academy', 'education', 'Mumbai'],
  ['Dosa Darbar', 'restaurant', 'Chennai'],
  ['ShineAuto Detailing', 'services', 'Gurugram'],
  ['Pearl Skin Clinic', 'clinic', 'Mumbai'],
  ['Barber Brothers', 'salon', 'Delhi'],
  ['Landmark Plots', 'real_estate', 'Indore'],
  ['Organic Basket', 'retail', 'Bengaluru'],
  ['Pinnacle IAS Coaching', 'education', 'Delhi'],
  ['Pizza Nova', 'restaurant', 'Pune'],
  ['EventEase Planners', 'services', 'Jaipur'],
  ['MotherCare Maternity', 'clinic', 'Hyderabad'],
  ['Henna by Noor', 'salon', 'Lucknow'],
  ['Metro Commercial Spaces', 'real_estate', 'Noida'],
  ['TechTown Mobiles', 'retail', 'Chennai'],
  ['Yoga with Meera', 'education', 'Rishikesh'],
  ['Momo Mania', 'restaurant', 'Kolkata'],
  ['Laundry Express', 'services', 'Bengaluru'],
]

const FIRST = ['Priya', 'Arjun', 'Kavya', 'Rohan', 'Ananya', 'Vikram', 'Sneha', 'Rahul', 'Meera', 'Karthik', 'Neha', 'Aditya', 'Divya', 'Sanjay', 'Pooja', 'Imran', 'Lakshmi', 'Farhan', 'Ishita', 'Manoj']
const LAST = ['Sharma', 'Iyer', 'Reddy', 'Patel', 'Nair', 'Gupta', 'Khan', 'Menon', 'Das', 'Singh', 'Rao', 'Joshi', 'Verma', 'Pillai', 'Shah']

const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '')

function phone(r: ReturnType<typeof seeded>) {
  return `+91 ${r.int(70000, 99999)} ${String(r.int(10000, 99999))}`
}

function makeBusinesses(): Business[] {
  const r = seeded(2026)
  return NAMES.map(([name, industry, city], i) => {
    // The last few names are this month's signups (still on trial).
    const fresh = i >= NAMES.length - 9
    const ageDays = fresh ? NAMES.length - i + r.int(0, 3) : Math.round(18 + ((NAMES.length - i) / NAMES.length) * 330 + r.int(0, 20))
    const roll = r.next()
    let status: BusinessStatus
    if (fresh) status = 'trial'
    else if (roll < 0.66) status = 'active'
    else if (roll < 0.74) status = 'past_due'
    else if (roll < 0.86) status = 'expired'
    else if (roll < 0.96) status = 'cancelled'
    else status = 'blocked'
    if (i === 3) status = 'active'
    const plan: PlanId = r.chance(0.2) ? 'pro' : r.chance(0.55) ? 'growth' : 'starter'
    const cycle: BillingCycle = r.chance(0.25) ? 'yearly' : 'monthly'
    const paying = status === 'active' || status === 'past_due'
    const mrr = paying ? (cycle === 'yearly' ? Math.round((PLANS[plan].monthly * 10) / 12) : PLANS[plan].monthly) : 0
    const demo = i === 3 // Olive & Thread, the demo workspace
    const connected = demo || (status === 'trial' ? r.chance(0.6) : status === 'expired' ? r.chance(0.25) : status === 'cancelled' ? r.chance(0.3) : r.chance(0.93))
    const waStatus: NumberStatus = connected ? 'connected' : status === 'cancelled' || status === 'blocked' ? 'disconnected' : 'not_connected'
    const q = r.next()
    const quality: Quality = demo ? 'green' : status === 'blocked' ? 'red' : q < 0.8 ? 'green' : q < 0.94 ? 'yellow' : 'red'
    const scale = plan === 'pro' ? 4 : plan === 'growth' ? 2 : 1
    const active = connected && (status === 'active' || status === 'past_due')
    const usage: Usage = active
      ? {
          marketing: r.int(80, 1400) * scale,
          utility: r.int(40, 900) * scale,
          authentication: r.chance(0.3) ? r.int(20, 400) : 0,
          service: r.int(200, 2200) * scale,
          ai: r.int(150, 2600) * scale,
        }
      : { marketing: 0, utility: 0, authentication: 0, service: status === 'trial' && connected ? r.int(10, 120) : 0, ai: status === 'trial' && connected ? r.int(10, 160) : 0 }
    const first = r.pick(FIRST)
    const last = r.pick(LAST)
    const flags: string[] = []
    if (quality === 'red') flags.push('Low number quality')
    if (status === 'past_due') flags.push('Payment failed')
    if (status === 'trial' && !connected && ageDays > 3) flags.push('WhatsApp not connected')
    const wallet = active ? Math.round((r.next() * 6000 - (r.chance(0.12) ? 4200 : 0)) * 100) / 100 : status === 'trial' || status === 'expired' ? 0 : Math.round(r.next() * 300 * 100) / 100
    if (active && wallet < 200) flags.push('Low wallet balance')
    const highMarketing = usage.marketing > 4000 && quality !== 'green'
    if (highMarketing) flags.push('Marketing spike')
    const createdAt = daysAgo(ageDays)
    return {
      id: `biz_${String(i + 1).padStart(3, '0')}`,
      name,
      industry,
      city,
      owner: { name: `${first} ${last}`, email: `${first.toLowerCase()}@${slug(name)}.in`, phone: phone(r) },
      plan,
      cycle,
      status,
      createdAt,
      trialEndsAt: new Date(new Date(createdAt).getTime() + 14 * DAY).toISOString(),
      renewsAt: paying ? daysAgo(-r.int(1, cycle === 'yearly' ? 300 : 29)) : null,
      mrr,
      wallet: demo ? 1032.64 : wallet,
      team: Math.min(PLANS[plan].seats ?? 20, r.int(1, plan === 'pro' ? 12 : plan === 'growth' ? 5 : 2)),
      contacts: active ? r.int(300, plan === 'pro' ? 40000 : plan === 'growth' ? 9000 : 1000) : r.int(0, 200),
      whatsapp: {
        status: waStatus,
        number: connected || waStatus === 'disconnected' ? phone(r) : '',
        displayName: name,
        quality,
        tier: connected ? (plan === 'pro' ? r.pick(['10K', '100K'] as const) : plan === 'growth' ? r.pick(['1K', '10K'] as const) : r.pick(['250', '1K'] as const)) : '250',
        templatesApproved: connected ? r.int(2, 30) : 0,
        templatesRejected: connected ? r.int(0, 4) : 0,
        connectedAt: connected ? daysAgo(Math.max(0, ageDays - r.int(0, 3))) : null,
      },
      usage,
      lastActiveAt: status === 'cancelled' || status === 'expired' ? daysAgo(r.int(20, 90)) : daysAgo(r.next() * (status === 'active' ? 2 : 9)),
      flags,
    }
  })
}

export const BUSINESSES: Business[] = makeBusinesses()
export const businessById = (id: string) => BUSINESSES.find((b) => b.id === id)

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

function makePayments(): Payment[] {
  const r = seeded(77)
  const out: Payment[] = []
  let inv = 1
  for (const b of BUSINESSES) {
    if (b.status === 'expired') continue
    if (b.status === 'trial') {
      if (r.chance(0.4)) out.push(pay(b, 'topup', r.pick([500, 1000]), r.int(0, 10), 'captured'))
      continue
    }
    const ageDays = Math.round((ADMIN_NOW - new Date(b.createdAt).getTime()) / DAY)
    for (let d = ageDays - 14; d >= 0; d -= b.cycle === 'yearly' ? 365 : 30) {
      const failed = b.status === 'past_due' && d < 30
      out.push(pay(b, 'subscription', b.cycle === 'yearly' ? PLANS[b.plan].monthly * 10 : PLANS[b.plan].monthly, d, failed ? 'failed' : 'captured'))
      if (b.status === 'cancelled' && d < ageDays - 90) break
    }
    const topups = b.status === 'active' ? r.int(1, 6) : r.int(0, 2)
    for (let k = 0; k < topups; k++) out.push(pay(b, 'topup', r.pick([500, 1000, 2000, 5000]), r.int(0, Math.min(ageDays, 120)), r.chance(0.05) ? 'failed' : 'captured'))
  }
  // A few refunds.
  for (const p of out.filter((x) => x.kind === 'topup' && x.status === 'captured').slice(3, 6)) {
    out.push({ ...p, id: `${p.id}_r`, razorpayId: `rfnd_${p.razorpayId.slice(4)}`, kind: 'refund', amount: -p.amount, gst: -p.gst, status: 'refunded', at: new Date(new Date(p.at).getTime() + 2 * DAY).toISOString(), invoice: null })
  }
  out.sort((a, b) => b.at.localeCompare(a.at))
  return out

  function pay(b: Business, kind: PaymentKind, amount: number, d: number, status: PaymentStatus): Payment {
    const id = `pmt_${String(out.length + 1).padStart(4, '0')}`
    const at = new Date(ADMIN_NOW - d * DAY - r.int(0, 20) * 36e5).toISOString()
    return {
      id,
      razorpayId: `pay_${Math.floor(r.next() * 36 ** 8).toString(36).toUpperCase().padStart(8, '0')}${r.int(10, 99)}`,
      businessId: b.id,
      kind,
      amount,
      gst: Math.round(amount * 0.18),
      method: kind === 'subscription' ? (r.chance(0.6) ? 'auto-debit' : 'card') : r.pick(['upi', 'upi', 'card', 'netbanking'] as const),
      status,
      at,
      invoice: status === 'captured' ? `AS/26-27/${String(inv++).padStart(4, '0')}` : null,
      failureReason: status === 'failed' ? r.pick(['Card declined by bank', 'UPI mandate expired', 'Insufficient funds']) : undefined,
    }
  }
}

export const PAYMENTS: Payment[] = makePayments()

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

export const MONTHS: MonthPoint[] = (() => {
  const r = seeded(12)
  const labels = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']
  let paying = 3
  return labels.map((month, i) => {
    const signups = Math.round(4 + i * 1.6 + r.int(0, 4))
    paying = Math.round(paying + signups * 0.34 - r.int(0, 2))
    const mrr = paying * r.int(2100, 2500)
    const topups = Math.round(paying * r.int(1400, 2200))
    return { month, signups, paying, mrr, subscriptions: mrr, topups, metaCost: Math.round(topups * 0.62), aiCost: Math.round(topups * 0.08) }
  })
})()

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

export const AI_DAYS: AiDay[] = (() => {
  const r = seeded(31)
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(ADMIN_NOW - (29 - i) * DAY)
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6
    const base = 5200 + i * 90
    return {
      day: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      fast: Math.round(base * (weekend ? 0.7 : 1) + r.int(-500, 500)),
      smart: Math.round(base * 0.32 * (weekend ? 0.7 : 1) + r.int(-200, 200)),
      errors: r.int(2, 40),
    }
  })
})()

export interface ServiceStatus {
  id: string
  name: string
  detail: string
  status: 'operational' | 'degraded' | 'down'
  uptime: number
  latencyMs: number
}

export const SERVICES: ServiceStatus[] = [
  { id: 'app', name: 'Web app', detail: 'Dashboard and API on Vercel', status: 'operational', uptime: 99.98, latencyMs: 182 },
  { id: 'db', name: 'Database', detail: 'Supabase Postgres and storage', status: 'operational', uptime: 99.99, latencyMs: 24 },
  { id: 'meta', name: 'WhatsApp Cloud API', detail: 'Sending messages through Meta', status: 'degraded', uptime: 99.71, latencyMs: 640 },
  { id: 'webhooks', name: 'Meta webhooks', detail: 'Incoming messages and status updates', status: 'operational', uptime: 99.95, latencyMs: 95 },
  { id: 'razorpay', name: 'Razorpay', detail: 'Payments, subscriptions and webhooks', status: 'operational', uptime: 99.99, latencyMs: 210 },
  { id: 'ai', name: 'AI provider', detail: 'Assistant replies', status: 'operational', uptime: 99.9, latencyMs: 1350 },
]

export interface Job {
  id: string
  name: string
  schedule: string
  lastRun: string
  durationS: number
  status: 'ok' | 'failed' | 'running'
}

export const JOBS: Job[] = [
  { id: 'j1', name: 'Send scheduled broadcasts', schedule: 'Every minute', lastRun: daysAgo(0.0008), durationS: 3, status: 'ok' },
  { id: 'j2', name: 'Run drip campaign steps', schedule: 'Every 5 minutes', lastRun: daysAgo(0.002), durationS: 11, status: 'ok' },
  { id: 'j3', name: 'Booking reminders', schedule: 'Every 15 minutes', lastRun: daysAgo(0.006), durationS: 6, status: 'ok' },
  { id: 'j4', name: 'Charge wallet for Meta fees', schedule: 'Hourly', lastRun: daysAgo(0.02), durationS: 42, status: 'ok' },
  { id: 'j5', name: 'Sync template status from Meta', schedule: 'Hourly', lastRun: daysAgo(0.03), durationS: 18, status: 'failed' },
  { id: 'j6', name: 'Renew subscriptions (Razorpay)', schedule: 'Daily 02:00', lastRun: daysAgo(0.35), durationS: 64, status: 'ok' },
  { id: 'j7', name: 'Trial ending emails', schedule: 'Daily 09:00', lastRun: daysAgo(0.06), durationS: 9, status: 'ok' },
  { id: 'j8', name: 'Nightly backups', schedule: 'Daily 03:00', lastRun: daysAgo(0.31), durationS: 480, status: 'running' },
]

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

export const SYSTEM_EVENTS: SystemEvent[] = (() => {
  const r = seeded(404)
  const templates: [SystemEvent['source'], string, string][] = [
    ['send', 'Message failed: recipient is not on WhatsApp', '131026'],
    ['send', 'Message failed: re-engagement window closed, a template is needed', '131047'],
    ['send', 'Rate limit hit for this number', '131056'],
    ['meta', 'Webhook signature check failed', 'SIG_401'],
    ['meta', 'Template paused by Meta for low quality', 'TPL_PAUSED'],
    ['razorpay', 'Subscription charge failed', 'BAD_REQUEST_ERROR'],
    ['razorpay', 'Webhook delivered twice (ignored)', 'DUPLICATE'],
    ['ai', 'AI reply timed out, handed to team', 'TIMEOUT'],
  ]
  return Array.from({ length: 24 }, (_, i) => {
    const [source, message, code] = r.pick(templates)
    return { id: `ev_${i + 1}`, source, businessId: r.pick(BUSINESSES).id, message, code, at: daysAgo(i * 0.12 + r.next() * 0.1), retries: r.int(0, 3), resolved: i > 6 && r.chance(0.6) }
  })
})()

/** Webhook deliveries per hour for the last 24 hours. */
export const WEBHOOK_HOURS = (() => {
  const r = seeded(24)
  return Array.from({ length: 24 }, (_, i) => {
    const h = (new Date(ADMIN_NOW).getUTCHours() + 6 - 23 + i + 48) % 24 // IST-ish labels
    const busy = h >= 9 && h <= 21
    return { hour: `${String(h).padStart(2, '0')}:00`, delivered: Math.round((busy ? 2400 : 600) + r.int(-300, 300)), failed: r.int(0, busy ? 14 : 4) }
  })
})()

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

export const ADMIN_TEAM: AdminUser[] = [
  { id: 'adm_1', name: 'You', email: 'founder@autoshift.app', role: 'super_admin', status: 'active', twoFactor: true, lastActiveAt: daysAgo(0) },
  { id: 'adm_2', name: 'Deepa Krishnan', email: 'deepa@autoshift.app', role: 'support', status: 'active', twoFactor: true, lastActiveAt: daysAgo(0.1) },
  { id: 'adm_3', name: 'Nikhil Bose', email: 'nikhil@autoshift.app', role: 'finance', status: 'active', twoFactor: false, lastActiveAt: daysAgo(2) },
  { id: 'adm_4', name: 'Sara Thomas', email: 'sara@autoshift.app', role: 'support', status: 'invited', twoFactor: false, lastActiveAt: null },
]

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

export const TICKETS: Ticket[] = (() => {
  const b = (i: number) => BUSINESSES[i]
  const t = (id: number, bi: number, subject: string, category: Ticket['category'], status: TicketStatus, priority: TicketPriority, assignee: string | null, d: number, msgs: [TicketMessage['from'], string][]): Ticket => ({
    id: `T-${1040 + id}`,
    businessId: b(bi).id,
    subject,
    category,
    status,
    priority,
    assignee,
    createdAt: daysAgo(d),
    messages: msgs.map(([from, text], k) => ({ from, author: from === 'business' ? b(bi).owner.name : from === 'note' ? 'Deepa Krishnan' : 'Deepa Krishnan', text, at: daysAgo(d - k * 0.04) })),
  })
  return [
    t(1, 4, 'Embedded Signup stops after choosing the number', 'WhatsApp connection', 'open', 'urgent', null, 0.05, [['business', 'I click Connect WhatsApp, pick my number, and the popup closes without connecting. Tried twice.']]),
    t(2, 1, 'Charged twice for the Growth plan?', 'Billing', 'open', 'high', 'Nikhil Bose', 0.2, [['business', 'I see two charges of ₹2,948.82 on my card this month. Please check.'], ['note', 'Razorpay shows one capture and one failed attempt. Confirming with the bank statement.']]),
    t(3, 9, 'Template rejected: "promotional content in utility"', 'Templates', 'pending', 'normal', 'Deepa Krishnan', 1.1, [['business', 'My order update template was rejected. What should I change?'], ['admin', 'Meta sees the "20% off" line as marketing. Remove the offer, or submit it as a Marketing template. Want me to suggest a version?']]),
    t(4, 16, 'AI assistant giving wrong prices', 'AI assistant', 'open', 'normal', 'Deepa Krishnan', 0.6, [['business', 'The assistant told a customer the 2BHK is 45 lakh, it is 62 lakh now.']]),
    t(5, 21, 'How do I add my receptionist?', 'Other', 'closed', 'low', 'Deepa Krishnan', 4, [['business', 'How can my receptionist also reply to chats?'], ['admin', 'Settings → Team → Invite. Choose the Agent role so she can reply but not change billing.'], ['business', 'Done, thank you!']]),
    t(6, 11, 'Inbox not loading on my phone', 'Bug', 'pending', 'high', 'Deepa Krishnan', 2, [['business', 'The inbox shows a spinner forever on my Android phone.'], ['admin', 'Thanks! Which browser and version? A screenshot would help.']]),
    t(7, 30, 'Wallet top-up shows pending', 'Billing', 'open', 'normal', null, 0.3, [['business', 'Paid ₹2,000 by UPI 20 minutes ago, wallet still shows pending.']]),
    t(8, 7, 'Number quality turned yellow', 'WhatsApp connection', 'closed', 'normal', 'Deepa Krishnan', 9, [['business', 'Why is my quality yellow?'], ['admin', 'Several people blocked your last broadcast. Send only to customers who opted in, and keep marketing to once a week for now.']]),
  ]
})()

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

export const ANNOUNCEMENTS: Announcement[] = [
  { id: 'an_1', title: 'Drip campaigns are here', body: 'Send a series of WhatsApp messages over days, and stop when the customer replies or books.', kind: 'news', audience: 'all', status: 'published', at: daysAgo(2), views: 412 },
  { id: 'an_2', title: 'Planned maintenance Sunday 2–3 AM', body: 'Sending may be delayed by a few minutes while we upgrade the database.', kind: 'maintenance', audience: 'all', status: 'scheduled', at: daysAgo(-3), views: 0 },
  { id: 'an_3', title: 'Your trial: connect WhatsApp to get started', body: 'Connect your number in two minutes and let your AI assistant answer customers today.', kind: 'banner', audience: 'trial', status: 'published', at: daysAgo(6), views: 58 },
  { id: 'an_4', title: 'Diwali offer: 20% off yearly plans', body: 'Switch to yearly billing before 5 November and save 20%.', kind: 'banner', audience: 'paying', status: 'draft', at: daysAgo(0), views: 0 },
]

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

export const AUDIT: AuditEntry[] = [
  { id: 'au_1', actor: 'You', role: 'super_admin', action: 'Signed in', target: 'Admin panel', details: '2-step code verified', at: daysAgo(0.01), ip: '49.37.12.8' },
  { id: 'au_2', actor: 'Deepa Krishnan', role: 'support', action: 'Replied to ticket', target: 'T-1043', details: 'Template rejection advice', at: daysAgo(1.05), ip: '103.21.58.4' },
  { id: 'au_3', actor: 'Nikhil Bose', role: 'finance', action: 'Refunded payment', target: 'Desi Kart', details: '₹1,000 top-up refunded to UPI', at: daysAgo(1.6), ip: '106.51.77.30' },
  { id: 'au_4', actor: 'You', role: 'super_admin', action: 'Extended trial', target: 'BrightPath Academy', details: '+7 days', at: daysAgo(2.2), ip: '49.37.12.8' },
  { id: 'au_5', actor: 'You', role: 'super_admin', action: 'Changed price', target: 'Growth plan', details: '₹2,299 → ₹2,499 per month', at: daysAgo(5), ip: '49.37.12.8' },
  { id: 'au_6', actor: 'Deepa Krishnan', role: 'support', action: 'Viewed as business', target: 'Glow Beauty Studio', details: 'Read-only, 6 minutes', at: daysAgo(5.4), ip: '103.21.58.4' },
  { id: 'au_7', actor: 'You', role: 'super_admin', action: 'Blocked business', target: 'Barber Brothers', details: 'Spam reports from customers', at: daysAgo(8), ip: '49.37.12.8' },
  { id: 'au_8', actor: 'You', role: 'super_admin', action: 'Invited admin', target: 'sara@autoshift.app', details: 'Role: Support', at: daysAgo(9), ip: '49.37.12.8' },
  { id: 'au_9', actor: 'Nikhil Bose', role: 'finance', action: 'Exported CSV', target: 'Payments', details: 'September 2026', at: daysAgo(24), ip: '106.51.77.30' },
]
