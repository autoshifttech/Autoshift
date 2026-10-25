/**
 * Demo mode: a `fetch` that answers the Supabase client (auth, REST, RPC,
 * storage) and the app's own `/api/*` routes from the in-memory sample
 * workspace, so the CRM can be browsed without a Supabase project.
 * Reads work; most writes stay in this tab and vanish on reload.
 */
import { createDemoData, demoOverview, DEMO_EMAIL, DEMO_USER_ID } from './data'
import { handleRest, type DemoDb, type DemoResponse, type Row } from './rest'
import { handleAppApi } from './api'

export { DEMO_COOKIE, isDemoCookieSet, setDemoCookie } from './cookie'

export const DEMO_READ_ONLY_MESSAGE = 'This is a demo — connect your workspace to save changes.'

export const demoUser = {
  id: DEMO_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: DEMO_EMAIL,
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'Asha Kumar' },
  created_at: '2026-01-01T00:00:00.000Z',
}

const b64url = (value: string) => btoa(value).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

/** A JWT-shaped (unsigned) token — nothing verifies it in demo mode. */
function demoAccessToken(expiresAt: number): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ sub: DEMO_USER_ID, email: DEMO_EMAIL, role: 'authenticated', aud: 'authenticated', exp: expiresAt }))
  return `${header}.${payload}.demo`
}

export function demoSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
  return {
    access_token: demoAccessToken(expiresAt),
    refresh_token: 'demo-refresh-token',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 365,
    expires_at: expiresAt,
    user: demoUser,
  }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): DemoResponse => ({
  status,
  headers: { 'content-type': 'application/json', ...headers },
  body,
})

function handleRpc(db: DemoDb, name: string, args: Row): DemoResponse {
  switch (name) {
    case 'dashboard_overview':
      return json(200, demoOverview(Number(args.p_days ?? 7), String(args.p_tz ?? 'UTC')))
    case 'filter_contacts_by_tags': {
      const tagIds = (args.p_tag_ids as string[] | undefined) ?? []
      const search = String(args.p_search ?? '').toLowerCase()
      const tagged = new Set(db.contact_tags.filter((ct) => tagIds.includes(String(ct.tag_id))).map((ct) => ct.contact_id))
      const rows = db.contacts
        .filter((c) => tagged.has(c.id))
        .filter((c) => !search || [c.name, c.phone, c.email].some((v) => String(v ?? '').toLowerCase().includes(search)))
      const offset = Number(args.p_offset ?? 0)
      const page = rows.slice(offset, offset + Number(args.p_limit ?? rows.length))
      return json(200, page.map((contact) => ({ contact, total_count: rows.length })))
    }
    default:
      // touch_presence and other side-effect RPCs: nothing to return.
      return json(200, null)
  }
}

function handleAuth(path: string, method: string): DemoResponse {
  if (path.endsWith('/user')) return json(200, demoUser)
  if (path.endsWith('/logout')) return { status: 204, headers: {}, body: null }
  if (path.endsWith('/token')) return json(200, demoSession())
  return json(method === 'GET' ? 404 : 400, { code: 'demo_mode', msg: DEMO_READ_ONLY_MESSAGE, error_description: DEMO_READ_ONLY_MESSAGE })
}

function toResponse({ status, headers, body }: DemoResponse): Response {
  const empty = status === 204 || body === null || body === undefined
  return new Response(empty ? (status === 200 ? 'null' : null) : JSON.stringify(body), { status, headers })
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<string | null> {
  if (init?.body !== undefined && init.body !== null) return typeof init.body === 'string' ? init.body : await new Response(init.body).text()
  if (input instanceof Request) return (await input.clone().text()) || null
  return null
}

/**
 * Builds the demo fetch. `supabaseOrigin` is the (placeholder) Supabase URL
 * the client was created with; anything else falls through to `realFetch`.
 */
export function createDemoFetch(supabaseOrigin: string, realFetch: typeof fetch, db: DemoDb = createDemoData()): typeof fetch {
  const origin = new URL(supabaseOrigin).origin
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), typeof window === 'undefined' ? origin : window.location.href)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const path = url.pathname

    if (url.origin === origin) {
      if (path.startsWith('/auth/v1/')) return toResponse(handleAuth(path, method))
      if (path.startsWith('/rest/v1/rpc/')) {
        const raw = await readBody(input, init)
        return toResponse(handleRpc(db, path.slice('/rest/v1/rpc/'.length), raw ? (JSON.parse(raw) as Row) : {}))
      }
      if (path.startsWith('/rest/v1/')) return toResponse(handleRest(db, method, url, headers, await readBody(input, init)))
      // Uploads "succeed" (nothing is stored); reads of stored files 404.
      if (path.startsWith('/storage/v1/')) {
        if (method === 'GET') return toResponse(json(404, { statusCode: '404', error: 'not_found', message: DEMO_READ_ONLY_MESSAGE }))
        const key = path.replace(/^\/storage\/v1\/object\//, '')
        return toResponse(json(200, { Key: key, Id: crypto.randomUUID() }))
      }
      return toResponse(json(404, { error: DEMO_READ_ONLY_MESSAGE }))
    }

    if (typeof window !== 'undefined' && url.origin === window.location.origin && path.startsWith('/api/')) {
      return toResponse(handleAppApi(db, method, path, await readBody(input, init)))
    }

    return realFetch(input, init)
  }
}

/** Realtime transport that never connects: no live updates in the demo, and no socket errors. */
export class InertWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3
  readyState = 0
  binaryType = 'arraybuffer'
  bufferedAmount = 0
  extensions = ''
  protocol = ''
  onopen: ((ev: unknown) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onmessage: ((ev: unknown) => void) | null = null
  constructor(public url: string) {}
  send() {}
  close() {
    this.readyState = 3
  }
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return false
  }
}
