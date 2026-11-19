import { createStore, useStore } from '@/lib/workspace/store'
import { backend, backendUrl } from '@/lib/backend/client'

/**
 * Accounts a flow can use: Google (Sheets, Calendar), and Razorpay or Cashfree (payment links).
 * Secrets are never kept here — only what is safe to show (an email, a masked key id).
 * Connected to the backend, the secret is sent once and stored there, encrypted.
 */
export type ConnectionKind = 'google' | 'razorpay' | 'cashfree' | 'shopify' | 'woocommerce'

/** Payment providers: a payment-link step or the shop assistant can use any of them. */
export const PAYMENT_KINDS: readonly ConnectionKind[] = ['razorpay', 'cashfree']
export const isPaymentKind = (k: ConnectionKind) => PAYMENT_KINDS.includes(k)
/** Online stores: products come from them, WhatsApp orders go to them. */
export const STORE_KINDS: readonly ConnectionKind[] = ['shopify', 'woocommerce']
export const isStoreKind = (k: ConnectionKind) => STORE_KINDS.includes(k)

/** Whether an account of kind `have` can serve a step that asks for `want`. */
export const kindFits = (want: ConnectionKind, have: ConnectionKind) => want === have || (isPaymentKind(want) && isPaymentKind(have))

export interface FlowConnection {
  id: string
  kind: ConnectionKind
  name: string
  /** Google email (or service-account email), or the provider's key / app id (masked). */
  detail: string
  /** "test" / "live" for Razorpay and Cashfree. */
  mode?: string
  createdAt: string
  /** Store options (Shopify / WooCommerce). */
  settings?: { sync_products?: boolean; push_orders?: boolean }
}

interface State {
  connections: FlowConnection[]
}

const initial = (): State => ({ connections: [] })

export const connectionsStore = createStore<State>(initial, backendUrl() ? undefined : 'autoshift.flow-connections.v1')
const SERVER = initial()
export const useConnections = () => useStore(connectionsStore, SERVER).connections

export function addConnection(c: Omit<FlowConnection, 'id' | 'createdAt'>) {
  connectionsStore.set((s) => ({
    connections: [{ ...c, id: `conn_${Date.now()}`, createdAt: new Date().toISOString() }, ...s.connections],
  }))
}

export function removeConnection(id: string) {
  connectionsStore.set((s) => ({ connections: s.connections.filter((c) => c.id !== id) }))
}

/** Shows the start and end of an id, hides the middle. */
export function maskKey(key: string): string {
  const k = key.trim()
  return k.length <= 10 ? `${k.slice(0, 3)}••••` : `${k.slice(0, 8)}••••${k.slice(-4)}`
}

/** Checks a pasted Google service-account JSON key; returns its email or an error code. */
export function parseServiceAccount(raw: string): { email: string } | { error: 'invalid' | 'notServiceAccount' } {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>
    const email = typeof j.client_email === 'string' ? j.client_email : ''
    if (j.type !== 'service_account' || !email.endsWith('.gserviceaccount.com') || typeof j.private_key !== 'string') {
      return { error: 'notServiceAccount' }
    }
    return { email }
  } catch {
    return { error: 'invalid' }
  }
}

// ------------------------------------------------------------- backend

interface ConnectionRow {
  id: string
  kind: ConnectionKind
  name: string
  detail: string
  mode: string | null
  created_at: string
  settings?: FlowConnection['settings'] | null
}
const fromRow = (r: ConnectionRow): FlowConnection => ({ id: r.id, kind: r.kind, name: r.name, detail: r.detail, mode: r.mode ?? undefined, createdAt: r.created_at, settings: r.settings ?? undefined })

export async function loadConnections(): Promise<void> {
  if (!backendUrl()) return
  const rows = await backend<ConnectionRow[]>('/v1/connections')
  connectionsStore.set({ connections: rows.map(fromRow) })
}

export type ConnectionSecret =
  | { kind: 'google'; name: string; serviceAccountJson: string }
  | { kind: 'razorpay'; name: string; keyId: string; keySecret: string; webhookSecret?: string }
  | { kind: 'cashfree'; name: string; appId: string; secretKey: string; mode: 'test' | 'live' }
  | { kind: 'shopify'; name: string; shop: string; accessToken?: string; clientId?: string; clientSecret?: string }
  | { kind: 'woocommerce'; name: string; url: string; consumerKey: string; consumerSecret: string }

/** Saves a connection with its secret on the server (encrypted there). Only used when connected. */
export async function createConnection(c: ConnectionSecret): Promise<{ id: string }> {
  const body =
    c.kind === 'google'
      ? { kind: 'google', name: c.name, google: { service_account_json: c.serviceAccountJson } }
      : c.kind === 'cashfree'
        ? { kind: 'cashfree', name: c.name, cashfree: { app_id: c.appId.trim(), secret_key: c.secretKey.trim(), mode: c.mode } }
        : c.kind === 'shopify'
          ? { kind: 'shopify', name: c.name, shopify: { shop: c.shop.trim(), access_token: c.accessToken?.trim() || null, client_id: c.clientId?.trim() || null, client_secret: c.clientSecret?.trim() || null } }
          : c.kind === 'woocommerce'
            ? { kind: 'woocommerce', name: c.name, woocommerce: { url: c.url.trim(), consumer_key: c.consumerKey.trim(), consumer_secret: c.consumerSecret.trim() } }
            : { kind: 'razorpay', name: c.name, razorpay: { key_id: c.keyId.trim(), key_secret: c.keySecret.trim(), webhook_secret: c.webhookSecret?.trim() || null } }
  const row = await backend<{ id: string }>('/v1/connections', { method: 'POST', body })
  await loadConnections()
  return row
}

export async function deleteConnection(id: string): Promise<void> {
  if (backendUrl()) {
    await backend(`/v1/connections/${id}`, { method: 'DELETE' })
    await loadConnections()
    return
  }
  removeConnection(id)
}

// ------------------------------------------------------------- Connect Google (sign in)

/** Whether "Connect Google" can sign in on this AutoShift (the platform set up a Google OAuth client). */
export async function googleSignInAvailable(): Promise<boolean> {
  if (!backendUrl()) return false
  try {
    return (await backend<{ oauth: boolean }>('/v1/connections/google/available')).oauth
  } catch {
    return false
  }
}

/** The Google sign-in page. Google sends the browser back to /flows/connections?google=… */
export async function startGoogleSignIn(name = ''): Promise<string> {
  const out = await backend<{ url: string }>(`/v1/connections/google/start?name=${encodeURIComponent(name.slice(0, 80))}`, { method: 'POST' })
  return out.url
}

/** Cashfree: test keys start with TEST (app id) or carry _test_ (secret key). */
export const cashfreeMode = (appId: string, secret: string): 'test' | 'live' =>
  appId.trim().toUpperCase().startsWith('TEST') || secret.includes('_test_') ? 'test' : 'live'

// ------------------------------------------------------------- online store (Shopify / WooCommerce)

export interface StoreStatus {
  sync_products: boolean
  push_orders: boolean
  products: number
  synced_at: string | null
  sync_error: string | null
  orders_sent: number
  orders_failed: { number: number; error: string }[]
}

export const storeStatus = (id: string) => backend<StoreStatus>(`/v1/connections/${id}/store`)

/** Products now (when switched on), then orders waiting to be sent or updated. */
export const syncStore = (id: string) =>
  backend<{ products: { count: number } | null; orders: { sent: number; updated: number } }>(`/v1/connections/${id}/sync`, { method: 'POST' })

export async function setStoreOptions(id: string, patch: { sync_products?: boolean; push_orders?: boolean }): Promise<void> {
  await backend(`/v1/connections/${id}`, { method: 'PATCH', body: patch })
  await loadConnections()
}
