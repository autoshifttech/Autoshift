import { createStore, useStore } from '@/lib/workspace/store'

/**
 * Accounts a flow can use: Google (Sheets, Calendar), Razorpay and Cashfree
 * (payment links). Secrets are never kept here — only what is safe to show
 * (an email, a key id, the last characters). The backend will hold the real,
 * encrypted secrets when it lands.
 */
export type ConnectionKind = 'google' | 'razorpay' | 'cashfree'

export interface FlowConnection {
  id: string
  kind: ConnectionKind
  name: string
  /** Service-account email, Razorpay key id or Cashfree client id (masked). */
  detail: string
  /** "test" / "live" for Razorpay, "sandbox" / "production" for Cashfree. */
  mode?: string
  createdAt: string
}

interface State {
  connections: FlowConnection[]
}

const initial = (): State => ({ connections: [] })

export const connectionsStore = createStore<State>(initial, 'autoshift.flow-connections.v1')
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
