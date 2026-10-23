import { env } from './env'
import { supabase } from './supabase'

export class ApiError extends Error {
  readonly status: number
  readonly step?: string

  constructor(message: string, status: number, step?: string) {
    super(message)
    this.status = status
    this.step = step
  }
}

type Options = { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; tenantId?: string; auth?: boolean }

export async function api<T>(path: string, { method = 'GET', body, tenantId, auth = true }: Options = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (tenantId) headers['X-Tenant-Id'] = tenantId
  if (auth) {
    const session = (await supabase?.auth.getSession())?.data.session
    if (!session) throw new ApiError('Your session has expired. Sign in again.', 401)
    headers.Authorization = `Bearer ${session.access_token}`
  }

  let response: Response
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Could not reach the Autoshift API. Check your connection and try again.', 0)
  }

  const text = await response.text()
  const data = text ? (JSON.parse(text) as unknown) : null
  if (!response.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail
    if (detail && typeof detail === 'object' && 'message' in detail) {
      const { message, step } = detail as { message: string; step?: string }
      throw new ApiError(message, response.status, step)
    }
    if (Array.isArray(detail)) throw new ApiError('Some fields are invalid. Check the form and try again.', response.status)
    throw new ApiError(typeof detail === 'string' ? detail : `Request failed (${response.status})`, response.status)
  }
  return data as T
}
