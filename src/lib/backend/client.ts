import { createClient } from '@/lib/supabase/client'
import { adminCookie } from '@/lib/admin/session'

/**
 * The AutoShift backend (FastAPI). Screens use it only when NEXT_PUBLIC_API_URL
 * is set; without it the app keeps working on its own data, as before.
 */
export function backendUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, '')
  return url ? url : null
}

export class BackendError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Calls the backend as the signed-in person. Throws BackendError with a readable message. */
export async function backend<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const base = backendUrl()
  if (!base) throw new BackendError(0, 'The backend is not connected')
  const { data } = await createClient().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new BackendError(401, 'Please sign in again')
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    // The admin device token proves this browser passed admin sign-in (the backend checks it on staff routes).
    headers: { Authorization: `Bearer ${token}`, ...(adminCookie() ? { 'X-Admin-2FA': adminCookie()! } : {}), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  if (res.status === 204) return undefined as T
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = payload?.detail
    throw new BackendError(res.status, typeof detail === 'string' ? detail : 'Something went wrong. Try again.')
  }
  return payload as T
}
