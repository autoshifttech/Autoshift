import { createStore, useStore } from '@/lib/workspace/store'

export const PLAN_IDS = ['starter', 'growth', 'pro'] as const
export type PlanId = (typeof PLAN_IDS)[number]
export type BillingCycle = 'monthly' | 'yearly'

export const TRIAL_DAYS = 14

/** null = unlimited. Prices are placeholders in INR (paise-free rupees), GST extra. */
export interface Plan {
  id: PlanId
  monthly: number
  seats: number | null
  contacts: number | null
  aiReplies: number
  bookingStaff: number | null
  popular?: boolean
}

export const PLANS: Record<PlanId, Plan> = {
  starter: { id: 'starter', monthly: 999, seats: 2, contacts: 1000, aiReplies: 1000, bookingStaff: 1 },
  growth: { id: 'growth', monthly: 2499, seats: 5, contacts: 10000, aiReplies: 5000, bookingStaff: 5, popular: true },
  pro: { id: 'pro', monthly: 5999, seats: 15, contacts: null, aiReplies: 20000, bookingStaff: null },
}

export const GST_RATE = 0.18

/** Yearly billing: 2 months free. */
export function planPrice(plan: Plan, cycle: BillingCycle): number {
  return cycle === 'monthly' ? plan.monthly : plan.monthly * 10
}

/** Price per month shown on the card for the chosen cycle. */
export function monthlyEquivalent(plan: Plan, cycle: BillingCycle): number {
  return cycle === 'monthly' ? plan.monthly : Math.round((plan.monthly * 10) / 12)
}

export function withGst(amount: number): { subtotal: number; gst: number; total: number } {
  const gst = Math.round(amount * GST_RATE)
  return { subtotal: amount, gst, total: amount + gst }
}

export interface Subscription {
  plan: PlanId
  cycle: BillingCycle
  status: 'trialing' | 'active' | 'cancelled'
  trialEndsAt: string
  renewsAt: string | null
}

export function trialDaysLeft(sub: Subscription, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - now) / 864e5))
}

function initialSubscription(): Subscription {
  return {
    plan: 'growth',
    cycle: 'monthly',
    status: 'trialing',
    trialEndsAt: new Date(Date.now() + 11 * 864e5).toISOString(),
    renewsAt: null,
  }
}

export const subscriptionStore = createStore(initialSubscription, 'autoshift.subscription')
const SERVER_SUB = initialSubscription()
export const useSubscription = () => useStore(subscriptionStore, SERVER_SUB)

/** Sample usage this billing period. */
export const SAMPLE_USAGE = { seats: 2, contacts: 842, aiReplies: 4310, bookingStaff: 3 }

export const SAMPLE_INVOICES = [
  { id: 'INV-2026-0091', date: '2026-09-25', amount: 2499, status: 'paid' as const },
  { id: 'INV-2026-0064', date: '2026-08-25', amount: 2499, status: 'paid' as const },
  { id: 'INV-2026-0037', date: '2026-07-25', amount: 999, status: 'paid' as const },
]

export function formatInr(amount: number, locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}
