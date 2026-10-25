/**
 * Demo mode: a `fetch` that answers the Supabase client (auth, REST, RPC,
 * storage) and the app's own `/api/*` routes from the in-memory sample
 * workspace, so the CRM can be browsed without a Supabase project.
 * Reads work; most writes stay in this tab and vanish on reload.
 */
import { createDemoData, demoOverview, DEMO_ACCOUNT_ID, DEMO_EMAIL, DEMO_USER_ID } from './data'
import { handleRest, type DemoDb, type DemoResponse, type Row } from './rest'

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

/** The app's own API routes, which would otherwise hit the server (and fail without Supabase). */
function handleAppApi(db: DemoDb, method: string, path: string, rawBody: string | null): DemoResponse {
  if (method === 'GET') {
    switch (path) {
      case '/api/automations':
        return json(200, { automations: db.automations })
      case '/api/flows':
        return json(200, { flows: db.flows })
      case '/api/flows/templates':
        return json(200, { templates: [] })
      case '/api/quick-replies':
        return json(200, { quick_replies: db.quick_replies })
      case '/api/whatsapp/config':
        return json(200, { connected: false, reason: 'no_config', message: 'WhatsApp is not connected in the demo workspace.' })
      case '/api/whatsapp/health':
        return json(200, { state: 'disconnected', displayPhoneNumber: null, quality: 'UNKNOWN', limit: null })
      case '/api/ai/config':
        return json(200, { configured: false })
      case '/api/ai/knowledge':
        return json(200, { documents: [] })
      case '/api/account/invitations':
        return json(200, { invitations: [] })
      case '/api/account/api-keys':
        return json(200, { keys: [] })
      case '/api/account/members':
        return json(200, {
          members: db.profiles.map((p) => ({
            user_id: p.user_id,
            full_name: p.full_name ?? '',
            email: p.email,
            avatar_url: p.avatar_url,
            role: p.account_role,
            joined_at: p.created_at,
          })),
        })
    }
    return json(404, { error: DEMO_READ_ONLY_MESSAGE })
  }

  // Sending a text message in the inbox: add it to the thread so the demo feels alive.
  if (method === 'POST' && path === '/api/whatsapp/send') {
    const body = rawBody ? (JSON.parse(rawBody) as Row) : {}
    const conversation = db.conversations.find((c) => c.id === body.conversation_id)
    if (!conversation || body.message_type !== 'text') return json(403, { error: DEMO_READ_ONLY_MESSAGE })
    const now = new Date().toISOString()
    const message = {
      id: crypto.randomUUID(),
      conversation_id: conversation.id,
      account_id: DEMO_ACCOUNT_ID,
      sender_type: 'agent',
      sender_id: DEMO_USER_ID,
      content_type: 'text',
      content_text: body.content_text,
      status: 'sent',
      message_id: `wamid.demo.${Date.now()}`,
      reply_to_message_id: body.reply_to_message_id ?? null,
      created_at: now,
    }
    db.messages.push(message)
    Object.assign(conversation, { last_message_text: body.content_text, last_message_at: now, last_reply_at: now })
    return json(200, { success: true, message_id: message.id, whatsapp_message_id: message.message_id })
  }

  return json(403, { error: DEMO_READ_ONLY_MESSAGE })
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
      if (path.startsWith('/storage/v1/')) return toResponse(json(method === 'GET' ? 404 : 403, { statusCode: '403', error: 'demo_mode', message: DEMO_READ_ONLY_MESSAGE }))
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
