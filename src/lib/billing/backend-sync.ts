/**
 * Plan, usage, invoices and GST details from the AutoShift backend (only when NEXT_PUBLIC_API_URL is set).
 * Without a backend everything here starts empty.
 */
import { createStore, useStore } from '@/lib/workspace/store'
import { backend, backendUrl } from '@/lib/backend/client'
import { subscriptionStore, type BillingCycle, type PlanId, type Subscription } from './plans'
import { billingDetailsStore, emptyBillingDetails, type BillingDetails } from './gst'
import { loadRazorpay } from '@/lib/razorpay'

export interface SubscriptionRow {
  plan_id: PlanId
  cycle: BillingCycle
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired'
  trial_ends_at: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export function toSubscription(r: SubscriptionRow): Subscription {
  // A subscription set to stop at the end of the period reads as cancelled; it still runs until then.
  const stopped = r.status === 'cancelled' || r.status === 'expired' || r.cancel_at_period_end
  return {
    plan: r.plan_id,
    cycle: r.cycle,
    status: stopped ? 'cancelled' : r.status === 'trialing' ? 'trialing' : 'active',
    trialEndsAt: r.trial_ends_at,
    renewsAt: r.current_period_end,
  }
}

export interface UsageView {
  seats: number
  contacts: number
  aiReplies: number
}
export interface InvoiceView {
  id: string
  date: string
  amount: number
  item: string
}

const noUsage = (): UsageView => ({ seats: 0, contacts: 0, aiReplies: 0 })
const usageStore = createStore<UsageView>(noUsage)
const invoicesStore = createStore<InvoiceView[]>(() => [])
const SERVER_USAGE = noUsage()
const SERVER_INVOICES: InvoiceView[] = []
export const useUsage = () => useStore(usageStore, SERVER_USAGE)
export const useInvoices = () => useStore(invoicesStore, SERVER_INVOICES)

interface DetailsRow {
  legal_name: string
  has_gstin: boolean
  gstin: string
  state_code: string
  address: string
  city: string
  pincode: string
  email: string
}
export const detailsFromRow = (r: DetailsRow): BillingDetails => ({ legalName: r.legal_name, hasGstin: r.has_gstin, gstin: r.gstin, stateCode: r.state_code, address: r.address, city: r.city, pincode: r.pincode, email: r.email })
export const detailsToRow = (d: BillingDetails): DetailsRow => ({ legal_name: d.legalName.trim(), has_gstin: d.hasGstin, gstin: d.hasGstin ? d.gstin.trim().toUpperCase() : '', state_code: d.stateCode, address: d.address.trim(), city: d.city.trim(), pincode: d.pincode.trim(), email: d.email.trim() })

export async function loadBilling(): Promise<void> {
  const [sub, usage, invoices, details] = await Promise.all([
    backend<SubscriptionRow>('/v1/subscription'),
    backend<{ seats: { used: number }; contacts: { used: number }; ai_replies: { used: number } }>('/v1/usage'),
    backend<{ number: string; issued_at: string; total_paise: number; description: string }[]>('/v1/invoices').catch(() => []),
    backend<DetailsRow>('/v1/billing-details').catch(() => null),
  ])
  subscriptionStore.set(toSubscription(sub))
  usageStore.set({ seats: usage.seats.used, contacts: usage.contacts.used, aiReplies: usage.ai_replies.used })
  invoicesStore.set(invoices.map((i) => ({ id: i.number, date: i.issued_at, amount: i.total_paise / 100, item: i.description })))
  if (details && details.legal_name) billingDetailsStore.set(detailsFromRow(details))
  else if (!details) billingDetailsStore.set(emptyBillingDetails())
}

/** Saves the invoice details: on the server when connected (it checks the GSTIN), otherwise in the browser. */
export async function saveBillingDetails(d: BillingDetails): Promise<void> {
  if (backendUrl()) await backend('/v1/billing-details', { method: 'PUT', body: detailsToRow(d) })
  billingDetailsStore.set(d)
}

export async function cancelSubscription(): Promise<void> {
  await backend('/v1/subscription/cancel', { method: 'POST' })
  await loadBilling()
}

interface CheckoutOrder {
  razorpay_subscription_id: string
  key_id: string
}
interface SubscriptionPayment {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

/** Opens Razorpay for a subscription; the server verifies the payment signature. */
export async function payForPlan(plan: PlanId, cycle: BillingCycle, prefill: { name?: string; email?: string } = {}): Promise<'paid' | 'cancelled'> {
  const order = await backend<CheckoutOrder>('/v1/subscription/checkout', { method: 'POST', body: { plan_id: plan, cycle } })
  const Razorpay = await loadRazorpay()
  const paid = await new Promise<SubscriptionPayment | null>((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.key_id,
      subscription_id: order.razorpay_subscription_id,
      name: 'AutoShift',
      description: `${plan} plan (${cycle})`,
      prefill,
      theme: { color: '#1E4C41' },
      handler: (r: SubscriptionPayment) => resolve(r),
      modal: { ondismiss: () => resolve(null) },
    })
    rzp.on('payment.failed', (r) => reject(new Error(r.error?.description || 'The payment did not go through.')))
    rzp.open()
  })
  if (!paid) return 'cancelled'
  await backend('/v1/subscription/verify', { method: 'POST', body: paid })
  await loadBilling()
  return 'paid'
}

let started = false
export function startBillingSync() {
  if (!backendUrl() || started) return
  started = true
  loadBilling().catch(() => {
    started = false
  })
}
