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
