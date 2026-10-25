/**
 * System emails AutoShift sends to business owners. The platform team can
 * switch each one off and edit its subject and text; {{variables}} are
 * filled in per business when the backend sends them.
 */
import { createStore, useStore } from '@/lib/workspace/store'

export const EMAIL_VARIABLES = ['owner_name', 'business_name', 'plan', 'days_left', 'amount', 'wallet_balance', 'template_name', 'reason', 'date', 'link'] as const

export interface OwnerEmail {
  id: string
  name: string
  group: 'Account' | 'Billing' | 'WhatsApp'
  trigger: string
  subject: string
  body: string
  button: string
  enabled: boolean
  /** Security and legal emails can't be switched off. */
  required?: boolean
  sent30d: number
  openRate: number
}

const e = (id: string, name: string, group: OwnerEmail['group'], trigger: string, subject: string, body: string, button: string, sent30d: number, openRate: number, required = false): OwnerEmail => ({ id, name, group, trigger, subject, body, button, enabled: true, required, sent30d, openRate })

export const DEFAULT_EMAILS: OwnerEmail[] = [
  e('welcome', 'Welcome', 'Account', 'Right after signing up', 'Welcome to AutoShift, {{owner_name}} 👋', "Hi {{owner_name}},\n\nThanks for starting your free trial for {{business_name}}. Three things to do first:\n1. Connect your WhatsApp number (2 minutes)\n2. Set up your AI assistant\n3. Send a test message to your own phone\n\nReply to this email if you get stuck. A real person reads it.", 'Connect WhatsApp', 9, 0.82),
  e('verify', 'Verify email', 'Account', 'Signing up or changing email', 'Confirm your email for AutoShift', 'Hi {{owner_name}},\n\nPlease confirm this is your email so we can keep your account safe.', 'Confirm email', 11, 0.91, true),
  e('reset', 'Password reset', 'Account', 'Someone asks to reset the password', 'Reset your AutoShift password', "Hi {{owner_name}},\n\nUse the button below to choose a new password. The link expires in 1 hour. If you didn't ask for this, you can ignore this email.", 'Reset password', 6, 0.88, true),
  e('trialEnding', 'Trial ending', 'Billing', '3 days and 1 day before the trial ends', 'Your AutoShift trial ends in {{days_left}} days', "Hi {{owner_name}},\n\nYour free trial for {{business_name}} ends on {{date}}. Choose a plan to keep your AI assistant answering customers without a break.", 'Choose a plan', 14, 0.67),
  e('receipt', 'Payment receipt', 'Billing', 'A plan payment or top-up succeeds', 'Receipt for {{amount}} · AutoShift', 'Hi {{owner_name}},\n\nThanks! We received {{amount}} for {{business_name}}. Your GST invoice is attached.', 'View invoice', 96, 0.54, true),
  e('paymentFailed', 'Payment failed', 'Billing', 'A subscription charge fails', 'Action needed: payment for {{business_name}} failed', "Hi {{owner_name}},\n\nWe couldn't charge {{amount}} for your {{plan}} plan ({{reason}}). We'll try again in 2 days. Update your payment method to avoid any interruption.", 'Update payment', 7, 0.79),
  e('walletLow', 'Wallet low', 'Billing', 'Wallet goes under the alert amount', 'Your WhatsApp credits are running low', 'Hi {{owner_name}},\n\nYour wallet has {{wallet_balance}} left. When it reaches zero, messages stop sending. Top up now or turn on auto-recharge.', 'Top up wallet', 23, 0.71),
  e('templateApproved', 'Template approved', 'WhatsApp', 'Meta approves a template', 'Template “{{template_name}}” is approved ✅', 'Hi {{owner_name}},\n\nMeta approved your template {{template_name}}. You can use it in broadcasts and drips now.', 'Use template', 41, 0.48),
  e('templateRejected', 'Template rejected', 'WhatsApp', 'Meta rejects a template', 'Template “{{template_name}}” needs changes', 'Hi {{owner_name}},\n\nMeta rejected {{template_name}}: {{reason}}. Edit it and submit again; most fixes take a minute.', 'Fix template', 12, 0.73),
  e('quality', 'Quality warning', 'WhatsApp', 'Number quality drops to medium or low', 'Your WhatsApp number quality dropped', 'Hi {{owner_name}},\n\nMeta lowered the quality rating of your number. This usually happens when people block or report messages. Send marketing only to opted-in customers and slow down for a few days.', 'See tips', 4, 0.86),
  e('deletion', 'Workspace deletion', 'Account', 'A workspace is scheduled for deletion', '{{business_name}} will be deleted on {{date}}', "Hi {{owner_name}},\n\nWe've scheduled {{business_name}} for deletion on {{date}}. Changed your mind? You can cancel any time before then.", 'Cancel deletion', 1, 0.95, true),
]

export const SAMPLE_VALUES: Record<(typeof EMAIL_VARIABLES)[number], string> = {
  owner_name: 'Karthik',
  business_name: 'Olive & Thread',
  plan: 'Growth',
  days_left: '3',
  amount: '₹2,948.82',
  wallet_balance: '₹142.50',
  template_name: 'festive_offer',
  reason: 'card declined by bank',
  date: '28 Oct 2026',
  link: 'https://app.autoshift.in',
}

/** Fill {{variables}} with sample values for the preview. */
export function fill(text: string, values: Record<string, string> = SAMPLE_VALUES): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => values[k] ?? m)
}

/** Variables used in a text that aren't known. */
export function unknownVariables(text: string): string[] {
  const known = new Set<string>(EMAIL_VARIABLES)
  return [...new Set([...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]).filter((k) => !known.has(k)))]
}

export const emailsStore = createStore(() => ({ emails: DEFAULT_EMAILS }), 'autoshift.admin.emails.v1')
const SERVER = { emails: DEFAULT_EMAILS }
export const useOwnerEmails = () => useStore(emailsStore, SERVER).emails
