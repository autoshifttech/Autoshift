/**
 * EXAMPLE PRICES — replace with Autoshift's real pricing before launch.
 * Monthly list prices per currency; longer billing periods apply the discount below.
 */
export type Currency = 'USD' | 'INR'
export type Period = 'monthly' | 'quarterly' | 'half-yearly' | 'yearly'
export type PlanFamily = 'business' | 'creator'

export const periods: { value: Period; label: string; months: number; discount: number }[] = [
  { value: 'monthly', label: 'Monthly', months: 1, discount: 0 },
  { value: 'quarterly', label: 'Quarterly', months: 3, discount: 0.1 },
  { value: 'half-yearly', label: 'Half-yearly', months: 6, discount: 0.2 },
  { value: 'yearly', label: 'Yearly', months: 12, discount: 0.3 },
]

export type Plan = {
  id: string
  family: PlanFamily
  name: string
  blurb: string
  monthly: Record<Currency, number> | null // null = custom pricing
  highlight?: boolean
  cta: { label: string; to: string }
  limits: { channels: string; assistants: string; tools: string; contacts: string; conversations: string; team: string }
  features: string[]
}

export const plans: Plan[] = [
  {
    id: 'free',
    family: 'business',
    name: 'Free',
    blurb: 'Try AI conversations on one channel.',
    monthly: { USD: 0, INR: 0 },
    cta: { label: 'Start free', to: '/login?mode=signup' },
    limits: { channels: '1', assistants: '1', tools: '5', contacts: '1,000', conversations: '1,000 / mo', team: '1' },
    features: ['WhatsApp, Instagram or Messenger', 'AI replies from your wallet', 'Shared inbox', 'Free WhatsApp tools'],
  },
  {
    id: 'growth',
    family: 'business',
    name: 'Growth',
    blurb: 'For small teams getting serious about chat.',
    monthly: { USD: 19, INR: 1499 },
    cta: { label: 'Start with Growth', to: '/login?mode=signup&plan=growth' },
    limits: { channels: '2', assistants: '2', tools: '15', contacts: '5,000', conversations: '10,000 / mo', team: '3' },
    features: ['Everything in Free', 'Broadcast campaigns', 'AI lead segmentation', 'Image understanding'],
  },
  {
    id: 'pro',
    family: 'business',
    name: 'Pro',
    blurb: 'Automation across every Meta channel.',
    monthly: { USD: 39, INR: 2999 },
    highlight: true,
    cta: { label: 'Start with Pro', to: '/login?mode=signup&plan=pro' },
    limits: { channels: '3', assistants: '5', tools: '30', contacts: '25,000', conversations: '50,000 / mo', team: '10' },
    features: ['Everything in Growth', 'Drip flows & scheduling', 'Voice-note understanding', 'Shopify & WooCommerce', 'API & webhooks'],
  },
  {
    id: 'business',
    family: 'business',
    name: 'Business',
    blurb: 'Higher limits, calling and priority support.',
    monthly: { USD: 79, INR: 5999 },
    cta: { label: 'Start with Business', to: '/login?mode=signup&plan=business' },
    limits: { channels: '3', assistants: '15', tools: 'Unlimited', contacts: '100,000', conversations: '200,000 / mo', team: '25' },
    features: ['Everything in Pro', 'AI voice calls', 'Zoho CRM integration', 'Priority support'],
  },
  {
    id: 'enterprise',
    family: 'business',
    name: 'Enterprise',
    blurb: 'Custom volume, integrations and terms.',
    monthly: null,
    cta: { label: 'Talk to sales', to: '/contact?topic=sales' },
    limits: { channels: 'Custom', assistants: 'Custom', tools: 'Unlimited', contacts: 'Custom', conversations: 'Custom', team: 'Custom' },
    features: ['Everything in Business', 'Custom integrations', 'Dedicated onboarding', 'Security review & DPA'],
  },
  {
    id: 'creator-starter',
    family: 'creator',
    name: 'Creator Starter',
    blurb: 'Automate Instagram & Messenger DMs.',
    monthly: { USD: 9, INR: 699 },
    cta: { label: 'Start as a creator', to: '/login?mode=signup&plan=creator-starter' },
    limits: { channels: '1 (IG or Messenger)', assistants: '1', tools: '10', contacts: '10,000', conversations: '10,000 / mo', team: '1' },
    features: ['Comment-to-DM automations', 'AI replies', 'Lead segmentation', 'Shared inbox'],
  },
  {
    id: 'creator-pro',
    family: 'creator',
    name: 'Creator Pro',
    blurb: 'For creators with a busy inbox.',
    monthly: { USD: 19, INR: 1499 },
    highlight: true,
    cta: { label: 'Start Creator Pro', to: '/login?mode=signup&plan=creator-pro' },
    limits: { channels: '2 (IG + Messenger)', assistants: '3', tools: '30', contacts: '50,000', conversations: '50,000 / mo', team: '3' },
    features: ['Everything in Creator Starter', 'Story-reply automations', 'Image understanding', 'Priority support'],
  },
]

export const limitLabels: { key: keyof Plan['limits']; label: string }[] = [
  { key: 'channels', label: 'Channels' },
  { key: 'assistants', label: 'AI assistants' },
  { key: 'tools', label: 'AI tools' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'team', label: 'Team members' },
]

export function priceFor(plan: Plan, currency: Currency, period: Period) {
  if (!plan.monthly) return null
  const { months, discount } = periods.find((p) => p.value === period)!
  const perMonth = Math.round(plan.monthly[currency] * (1 - discount))
  return { perMonth, billed: perMonth * months, months }
}

export function formatMoney(amount: number, currency: Currency) {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}
