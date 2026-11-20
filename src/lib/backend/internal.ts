/**
 * Server-only calls from this app to the AutoShift backend: charge the wallet for messages Meta billed,
 * and forward events for the business's webhooks and n8n. Switched on by AUTOSHIFT_API_URL and
 * AUTOSHIFT_INTERNAL_SECRET (never NEXT_PUBLIC_: the secret acts for every business).
 * Every call is best-effort and never throws, so it can't break the WhatsApp webhook.
 */
// Server-only: imported by route handlers and server libraries, never by client components.

export type MessageCategory = 'marketing' | 'utility' | 'authentication' | 'service' | 'ai'

function config(): { url: string; secret: string } | null {
  const url = process.env.AUTOSHIFT_API_URL?.trim().replace(/\/+$/, '')
  const secret = process.env.AUTOSHIFT_INTERNAL_SECRET?.trim()
  return url && secret ? { url, secret } : null
}

export const internalConfigured = () => config() !== null

async function post(path: string, body: unknown): Promise<Response | null> {
  const c = config()
  if (!c) return null
  try {
    return await fetch(`${c.url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AutoShift-Internal': c.secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    })
  } catch (err) {
    console.error(`[backend] ${path} failed:`, err)
    return null
  }
}

/** Meta's pricing block on a status: which of our charge categories it is, or null when free / unknown. */
export function billableCategory(pricing: { billable?: boolean; category?: string } | undefined): MessageCategory | null {
  if (!pricing?.billable || !pricing.category) return null
  const c = pricing.category.toLowerCase()
  if (c.startsWith('authentication')) return 'authentication' // incl. authentication_international
  if (c === 'marketing' || c === 'marketing_lite') return 'marketing'
  if (c === 'utility') return 'utility'
  if (c === 'service') return 'service'
  return null // referral_conversion and anything new: not charged until priced
}

/** Charge one billed message. The WhatsApp message id makes it safe to call on every status update. */
export async function chargeBilledMessage(accountId: string, wamid: string, category: MessageCategory): Promise<void> {
  const res = await post('/v1/internal/charge', { account_id: accountId, category, units: 1, ref: wamid, idempotency_key: `msg:${wamid}` })
  if (res && !res.ok && res.status !== 402) console.error('[backend] charge refused:', res.status)
}

/** Forward an event this app already emits to the backend (its webhooks and the n8n trigger). */
export async function forwardEvent(accountId: string, type: string, data: unknown): Promise<void> {
  await post('/v1/internal/events', { account_id: accountId, type, data })
}

export interface AssistantReply {
  status: 'reply' | 'handoff' | 'no_model' | 'no_funds' | 'failed' | 'off' | 'plan_limit'
  text: string
  reason: string
  /** Set when the shop assistant placed an order in this reply. */
  order?: { id: string; number: number } | null
  /** Tap-buttons to send under the reply (WhatsApp reply buttons; 3 at most). */
  buttons?: string[]
}

/**
 * One reply from the business's AI assistant (platform AI, charged to the wallet, plan limit and
 * hand-off rules applied by the backend). Null when the backend isn't reachable.
 */
export async function assistantReply(args: { accountId: string; assistantId: string; message: string; history: { role: 'user' | 'assistant'; content: string }[]; ref: string; recentAiReplies?: number; conversationId?: string; contactId?: string; customerPhone?: string | null }): Promise<AssistantReply | null> {
  const c = config()
  if (!c) return null
  try {
    const res = await fetch(`${c.url}/v1/internal/ai-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AutoShift-Internal': c.secret },
      body: JSON.stringify({ account_id: args.accountId, assistant_id: args.assistantId, message: args.message.slice(0, 4000), history: args.history.slice(-40), ref: args.ref, recent_ai_replies: args.recentAiReplies ?? null, conversation_id: args.conversationId ?? null, contact_id: args.contactId ?? null, customer_phone: args.customerPhone?.slice(0, 32) ?? null }),
      // A model call: give it longer than the bookkeeping calls above.
      signal: AbortSignal.timeout(50000),
    })
    if (!res.ok) {
      console.error('[backend] ai-reply refused:', res.status)
      return null
    }
    return (await res.json()) as AssistantReply
  } catch (err) {
    console.error('[backend] ai-reply failed:', err)
    return null
  }
}

export interface PaymentLinkResult {
  id: string
  short_url: string | null
  qr_image_url: string | null
  amount_paise: number
  mode: string | null
  qr_problem: string | null
}

/**
 * The inbox's ✨ button: the business's AI assistant suggests a reply for a person to edit and send
 * (platform AI, charged like one AI reply; never hands off, never places an order). Null when the
 * backend isn't reachable.
 */
export async function assistantDraft(args: { accountId: string; assistantId: string; message: string; history: { role: 'user' | 'assistant'; content: string }[]; contactId?: string | null; conversationId?: string }): Promise<AssistantReply | null> {
  const c = config()
  if (!c) return null
  try {
    const res = await fetch(`${c.url}/v1/internal/ai-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AutoShift-Internal': c.secret },
      body: JSON.stringify({ account_id: args.accountId, assistant_id: args.assistantId, message: args.message.slice(0, 4000), history: args.history.slice(-40), contact_id: args.contactId ?? null, conversation_id: args.conversationId ?? null }),
      signal: AbortSignal.timeout(50000),
    })
    if (!res.ok) {
      console.error('[backend] ai-draft refused:', res.status)
      return null
    }
    return (await res.json()) as AssistantReply
  } catch (err) {
    console.error('[backend] ai-draft failed:', err)
    return null
  }
}

/**
 * A Razorpay payment link (and optional UPI QR picture) on the business's own Razorpay account, for
 * a flow's payment step. Throws with the backend's reason so the flow can take its "if it fails" exit.
 */
export async function createPaymentLink(args: {
  accountId: string
  connectionId?: string | null
  amount: string
  description: string
  contactId?: string | null
  conversationId?: string | null
  flowRunId?: string | null
  leadId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  sendQr?: boolean
}): Promise<PaymentLinkResult> {
  const c = config()
  if (!c) throw new Error('The AutoShift API is not connected (AUTOSHIFT_API_URL / AUTOSHIFT_INTERNAL_SECRET)')
  const res = await fetch(`${c.url}/v1/internal/payment-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AutoShift-Internal': c.secret },
    body: JSON.stringify({
      account_id: args.accountId,
      connection_id: args.connectionId || null,
      amount: args.amount,
      description: args.description.slice(0, 2000),
      contact_id: args.contactId ?? null,
      conversation_id: args.conversationId ?? null,
      flow_run_id: args.flowRunId ?? null,
      lead_id: args.leadId ?? null,
      customer_name: args.customerName?.slice(0, 120) || null,
      customer_phone: args.customerPhone?.slice(0, 32) || null,
      send_qr: Boolean(args.sendQr),
    }),
    signal: AbortSignal.timeout(30000),
  })
  const data = (await res.json().catch(() => ({}))) as Partial<PaymentLinkResult> & { detail?: unknown }
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Payment link refused (${res.status})`)
  return data as PaymentLinkResult
}

/**
 * A flow's Google step, run with the business's own Google account: adds a row to a sheet or an
 * event to a calendar. Throws with the backend's reason so the flow can take its "if it fails" exit.
 */
export async function runGoogleAction(args: {
  accountId: string
  connectionId?: string | null
  service: 'google_sheets_append' | 'google_calendar_event'
  params: Record<string, string>
}): Promise<{ link?: string }> {
  const c = config()
  if (!c) throw new Error('The AutoShift API is not connected (AUTOSHIFT_API_URL / AUTOSHIFT_INTERNAL_SECRET)')
  const res = await fetch(`${c.url}/v1/internal/google-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AutoShift-Internal': c.secret },
    body: JSON.stringify({ account_id: args.accountId, connection_id: args.connectionId || null, service: args.service, params: args.params }),
    signal: AbortSignal.timeout(30000),
  })
  const data = (await res.json().catch(() => ({}))) as { link?: string; detail?: unknown }
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Google step refused (${res.status})`)
  return data
}
