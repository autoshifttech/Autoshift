/**
 * Demo mode: the app's own `/api/*` routes, answered in the tab so every
 * screen can be tried without a backend. Saves, creates and deletes update
 * the in-memory sample workspace and report success; nothing reaches
 * WhatsApp, an AI provider or a database, and a reload starts over.
 */
import { DEMO_ACCOUNT_ID, DEMO_USER_ID } from './data'
import type { DemoDb, DemoResponse, Row } from './rest'

const json = (status: number, body: unknown): DemoResponse => ({ status, headers: { 'content-type': 'application/json' }, body })
const ok = (body: unknown = { success: true }) => json(200, body)
const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

function parse(rawBody: string | null): Row {
  if (!rawBody) return {}
  try {
    return JSON.parse(rawBody) as Row
  } catch {
    return {} // multipart uploads and other non-JSON bodies
  }
}

type ApiStep = { id?: string; step_type: string; step_config: Row; branches?: { yes: ApiStep[]; no: ApiStep[] } }
type ServerStep = { id: string; step_type: string; step_config: Row; branches: { yes: ServerStep[]; no: ServerStep[] } }

const toServerSteps = (steps: ApiStep[] = []): ServerStep[] =>
  steps.map((s) => ({
    id: s.id ?? newId(),
    step_type: s.step_type,
    step_config: s.step_config ?? {},
    branches: { yes: toServerSteps(s.branches?.yes), no: toServerSteps(s.branches?.no) },
  }))

/** Step trees for automations created or edited in this tab (sample ones fall back to their flat steps). */
const stepTrees = new Map<string, ServerStep[]>()

function automationSteps(db: DemoDb, id: string): ServerStep[] {
  return (
    stepTrees.get(id) ??
    db.automation_steps
      .filter((s) => s.automation_id === id && !s.parent_step_id)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((s) => ({ id: String(s.id), step_type: String(s.step_type), step_config: (s.step_config as Row) ?? {}, branches: { yes: [], no: [] } }))
  )
}

const DEMO_PHONE_INFO = { display_phone_number: '+91 98765 43210', verified_name: 'Olive & Thread', quality_rating: 'GREEN', code_verification_status: 'VERIFIED' }

/** Small canned replies so the AI playground and drafts show something sensible. */
function aiReply(message: string): string {
  const m = message.toLowerCase()
  if (/price|cost|how much|rate/.test(m)) return 'Our linen shirts start at ₹1,499 and kurtas at ₹1,899. Would you like the catalogue link?'
  if (/book|appointment|slot|visit/.test(m)) return 'Happy to help you book! We have free slots tomorrow at 11:00, 14:30 and 16:00. Which one suits you?'
  if (/hour|open|timing|time/.test(m)) return 'We’re open Monday to Saturday, 10am to 8pm.'
  if (/deliver|shipping/.test(m)) return 'Orders ship within 24 hours and usually arrive in 2–4 days.'
  return 'Thanks for your message! I can help with prices, sizes, delivery and bookings. What would you like to know?'
}

export function handleAppApi(db: DemoDb, method: string, path: string, rawBody: string | null): DemoResponse {
  const body = parse(rawBody)
  const parts = path.replace(/^\/api\//, '').split('/')
  const [area, a, b] = parts
  db.ai_configs ??= []
  db.ai_knowledge ??= []

  // --- Automations ----------------------------------------------------------
  if (area === 'automations') {
    if (!a) {
      if (method === 'GET') return ok({ automations: db.automations })
      if (method === 'POST') {
        const automation = { id: newId(), account_id: DEMO_ACCOUNT_ID, user_id: DEMO_USER_ID, execution_count: 0, last_executed_at: null, created_at: now(), updated_at: now(), ...body, steps: undefined }
        db.automations.push(automation)
        stepTrees.set(String(automation.id), toServerSteps(body.steps as ApiStep[]))
        return json(201, { automation })
      }
    }
    const automation = db.automations.find((x) => x.id === a)
    if (!automation) return json(404, { error: 'Automation not found' })
    if (b === 'duplicate' && method === 'POST') {
      const copy = { ...automation, id: newId(), name: `${automation.name} (copy)`, is_active: false, execution_count: 0, created_at: now() }
      db.automations.push(copy)
      stepTrees.set(String(copy.id), automationSteps(db, String(automation.id)))
      return json(201, { automation: copy })
    }
    if (method === 'GET') return ok({ automation, steps: automationSteps(db, String(automation.id)) })
    if (method === 'PATCH') {
      const { steps, ...fields } = body
      Object.assign(automation, fields, { updated_at: now() })
      if (steps) stepTrees.set(String(automation.id), toServerSteps(steps as ApiStep[]))
      return ok({ automation })
    }
    if (method === 'DELETE') {
      db.automations = db.automations.filter((x) => x !== automation)
      return ok()
    }
  }

  // --- Flows (hidden from the menu, but keep them usable) ---------------------
  if (area === 'flows') {
    if (a === 'templates') return ok({ templates: [] })
    if (!a) {
      if (method === 'GET') return ok({ flows: db.flows })
      if (method === 'POST') {
        const flow = {
          id: newId(),
          account_id: DEMO_ACCOUNT_ID,
          user_id: DEMO_USER_ID,
          name: (body.name as string) || 'Untitled flow',
          description: null,
          status: 'draft',
          trigger_type: 'keyword',
          trigger_config: { keywords: [], match_type: 'contains' },
          entry_node_id: null,
          fallback_policy: 'restart',
          execution_count: 0,
          created_at: now(),
          updated_at: now(),
        }
        db.flows.push(flow)
        return json(201, { flow })
      }
    }
    const flow = db.flows.find((x) => x.id === a)
    if (!flow) return json(404, { error: 'Flow not found' })
    if (b === 'runs') return ok({ flow: { id: flow.id, name: flow.name }, runs: [], events: [] })
    if (b === 'activate') {
      flow.status = method === 'DELETE' ? 'draft' : 'active'
      return ok({ flow })
    }
    if (method === 'GET') return ok({ flow, nodes: (flow.nodes as unknown[]) ?? [] })
    if (method === 'PATCH' || method === 'PUT') {
      Object.assign(flow, body, { updated_at: now() })
      return ok({ flow })
    }
    if (method === 'DELETE') {
      db.flows = db.flows.filter((x) => x !== flow)
      return ok()
    }
  }

  // --- Quick replies ----------------------------------------------------------
  if (area === 'quick-replies') {
    if (!a && method === 'GET') return ok({ quick_replies: db.quick_replies })
    if (!a && method === 'POST') {
      const quick_reply = { id: newId(), account_id: DEMO_ACCOUNT_ID, user_id: DEMO_USER_ID, kind: 'text', created_at: now(), updated_at: now(), ...body }
      db.quick_replies.push(quick_reply)
      return json(201, { quick_reply })
    }
    const qr = db.quick_replies.find((x) => x.id === a)
    if (qr && (method === 'PATCH' || method === 'PUT')) return ok({ quick_reply: Object.assign(qr, body, { updated_at: now() }) })
    if (method === 'DELETE') {
      db.quick_replies = db.quick_replies.filter((x) => x.id !== a)
      return ok()
    }
  }

  // --- AI ---------------------------------------------------------------------
  if (area === 'ai') {
    if (a === 'config') {
      if (method === 'GET') {
        const cfg = db.ai_configs[0]
        if (!cfg) return ok({ configured: false })
        const { api_key, embeddings_api_key, ...safe } = cfg
        return ok({ configured: true, has_key: !!api_key, has_embeddings_key: !!embeddings_api_key, ...safe })
      }
      if (method === 'POST') {
        const prev = db.ai_configs[0] ?? {}
        db.ai_configs = [{ ...prev, ...body, api_key: body.api_key || prev.api_key || 'demo-key', updated_at: now() }]
        return ok()
      }
      if (method === 'DELETE') {
        db.ai_configs = []
        return ok()
      }
    }
    if (a === 'test') return ok({ success: true })
    if (a === 'playground') {
      const history = (body.messages as { content?: string }[] | undefined) ?? []
      const last = String(body.message ?? history.at(-1)?.content ?? '')
      return ok({ reply: aiReply(last), handoff: /human|agent|call me|person/i.test(last) })
    }
    if (a === 'draft') return ok({ draft: aiReply(String(body.context ?? body.message ?? '')) })
    if (a === 'autoreply') return ok()
    if (a === 'usage') {
      return ok({
        window_days: 30,
        time_zone: 'Asia/Kolkata',
        truncated: false,
        totals: { calls: 412, prompt_tokens: 182340, completion_tokens: 40120, total_tokens: 222460 },
        by_mode: [],
        by_model: [],
        by_day: [],
      })
    }
    if (a === 'knowledge') {
      if (b === 'reindex') return ok({ success: true, reindexed: db.ai_knowledge.length, total: db.ai_knowledge.length, failed: [], keyword_only: [] })
      if (!b && method === 'GET') return ok({ documents: db.ai_knowledge.map(({ id, title, updated_at }) => ({ id, title, updated_at })) })
      if (!b && method === 'POST') {
        const doc = { id: newId(), title: (body.title as string) || 'Untitled document', content: body.content ?? '', updated_at: now() }
        db.ai_knowledge.push(doc)
        return ok({ success: true, id: doc.id })
      }
      const doc = db.ai_knowledge.find((x) => x.id === b)
      if (method === 'GET') return doc ? ok({ document: doc }) : json(404, { error: 'Not found' })
      if (method === 'PATCH' || method === 'PUT') {
        if (doc) Object.assign(doc, body, { updated_at: now() })
        return ok({ success: true, id: b })
      }
      if (method === 'DELETE') {
        db.ai_knowledge = db.ai_knowledge.filter((x) => x.id !== b)
        return ok()
      }
    }
  }

  // --- Account: members, invitations, API keys --------------------------------
  if (area === 'account') {
    db.account_invitations ??= []
    db.api_keys ??= []
    if (a === 'members') {
      if (method === 'GET') {
        return ok({
          members: db.profiles.map((p) => ({ user_id: p.user_id, full_name: p.full_name ?? '', email: p.email, avatar_url: p.avatar_url, role: p.account_role, joined_at: p.created_at })),
        })
      }
      const member = db.profiles.find((p) => p.user_id === b)
      if (member && method === 'PATCH') {
        member.account_role = body.role
        return ok()
      }
      if (method === 'DELETE') {
        db.profiles = db.profiles.filter((p) => p.user_id !== b)
        return ok()
      }
    }
    if (a === 'invitations') {
      if (!b && method === 'GET') return ok({ invitations: db.account_invitations })
      if (!b && method === 'POST') {
        const invitation = { id: newId(), role: body.role ?? 'agent', label: body.label ?? null, created_at: now(), expires_at: new Date(Date.now() + 7 * 864e5).toISOString() }
        db.account_invitations.push(invitation)
        return json(201, { invitation, url: `${typeof window === 'undefined' ? '' : window.location.origin}/join/demo-${invitation.id.slice(0, 8)}`, expiresInDays: 7 })
      }
      if (method === 'DELETE') {
        db.account_invitations = db.account_invitations.filter((x) => x.id !== b)
        return ok()
      }
    }
    if (a === 'api-keys') {
      if (!b && method === 'GET') return ok({ keys: db.api_keys })
      if (!b && method === 'POST') {
        const secret = `autoshift_live_demo${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
        const key = { id: newId(), name: body.name ?? 'API key', key_prefix: secret.slice(0, 20), scopes: body.scopes ?? [], last_used_at: null, expires_at: body.expires_at ?? null, revoked_at: null, created_at: now() }
        db.api_keys.push(key)
        return json(201, { key, plaintext: secret })
      }
      const key = db.api_keys.find((x) => x.id === b)
      if (key && method === 'DELETE') {
        key.revoked_at = now()
        return ok()
      }
    }
  }

  // --- WhatsApp ---------------------------------------------------------------
  if (area === 'whatsapp') {
    db.whatsapp_config ??= []
    if (a === 'config' && !b) {
      if (method === 'GET') {
        return db.whatsapp_config.length
          ? ok({ connected: true, phone_info: DEMO_PHONE_INFO, waba_subscription: { checked: true, subscribed: true, app_id_match: true } })
          : ok({ connected: false, reason: 'no_config', message: 'WhatsApp is not connected in the demo workspace.' })
      }
      if (method === 'POST') {
        db.whatsapp_config = [{ ...body, access_token: undefined, status: 'connected', updated_at: now() }]
        return ok({ success: true, connected: true, phone_info: DEMO_PHONE_INFO })
      }
      if (method === 'DELETE') {
        db.whatsapp_config = []
        return ok()
      }
    }
    if (a === 'config' && b === 'verify-registration') return ok({ registered: true, status: 'CONNECTED' })
    if (a === 'health') {
      return ok(db.whatsapp_config.length ? { state: 'connected', displayPhoneNumber: DEMO_PHONE_INFO.display_phone_number, quality: 'GREEN', limit: 'TIER_1K' } : { state: 'disconnected', displayPhoneNumber: null, quality: 'UNKNOWN', limit: null })
    }
    if (a === 'templates' && b === 'sync') return ok({ total: db.message_templates.length, inserted: 0, updated: db.message_templates.length, errors: [], truncated: false })
    if (a === 'templates' && b && method === 'DELETE') {
      db.message_templates = db.message_templates.filter((x) => x.id !== b)
      return ok()
    }
    if (a === 'react') return ok()
    if (a === 'send' && method === 'POST') return sendMessage(db, body)
    if (a === 'broadcast') {
      if (!b && method === 'POST') {
        const recipients = (body.recipients as { phone: string }[] | undefined) ?? []
        return ok({ success: true, results: recipients.map((r) => ({ phone: r.phone, status: 'sent', whatsapp_message_id: `wamid.demo.${newId().slice(0, 8)}` })) })
      }
      return ok()
    }
    if (a === 'media') return json(404, { error: 'Media isn’t available in the demo.' })
  }

  if (area === 'tags' && method === 'POST') {
    const tag = { id: newId(), account_id: DEMO_ACCOUNT_ID, user_id: DEMO_USER_ID, color: '#64748b', created_at: now(), ...body }
    db.tags.push(tag)
    return json(201, { tag })
  }

  // Anything else: pretend it worked so the screen moves on.
  return method === 'GET' ? json(404, { error: 'Not available in the demo.' }) : ok()
}

/** Inbox send: append to the thread (text, media captions, templates) so the conversation updates. */
function sendMessage(db: DemoDb, body: Row): DemoResponse {
  const conversation = db.conversations.find((c) => c.id === body.conversation_id)
  if (!conversation) return json(404, { error: 'Conversation not found' })
  const type = String(body.message_type ?? 'text')
  const text = (body.content_text as string) || (body.template_name ? `Template: ${body.template_name}` : type === 'text' ? '' : `[${type}]`)
  const message = {
    id: newId(),
    conversation_id: conversation.id,
    account_id: DEMO_ACCOUNT_ID,
    sender_type: 'agent',
    sender_id: DEMO_USER_ID,
    content_type: type === 'template' ? 'text' : type,
    content_text: text,
    media_url: body.media_url ?? null,
    status: 'sent',
    message_id: `wamid.demo.${Date.now()}`,
    reply_to_message_id: body.reply_to_message_id ?? null,
    created_at: now(),
  }
  db.messages.push(message)
  Object.assign(conversation, { last_message_text: text, last_message_at: message.created_at, last_reply_at: message.created_at })
  return ok({ success: true, message_id: message.id, whatsapp_message_id: message.message_id })
}
