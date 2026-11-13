// ============================================================
// POST /api/internal/mcp — the AutoShift backend's bridge into this app's WhatsApp code.
//
// The backend's MCP tools check the caller's API key, role, opt-outs and blocklist, then call
// here so a message, broadcast, template or knowledge document goes through exactly the same
// code the dashboard uses (Meta calls, inbox records, flow pausing, template builder).
//
// Guarded by the shared AUTOSHIFT_INTERNAL_SECRET (header X-AutoShift-Internal). Never reachable
// from a browser session: with no secret configured, it answers 503.
//
// Body: { action, account_id, user_id, role, ...action fields }
// ============================================================

import { after, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

import { runAsAccount, type AccountContext } from '@/lib/auth/account'
import { isAccountRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation'
import { sendMessageToConversation, validateSendMessageParams, SendMessageError } from '@/lib/whatsapp/send-message'
import { createBroadcast, deliverBroadcast, BroadcastError } from '@/lib/whatsapp/broadcast-core'
import { markBroadcastScheduled } from '@/lib/whatsapp/broadcast-schedule'
import { POST as syncTemplates } from '@/app/api/whatsapp/templates/sync/route'
import { POST as submitTemplate } from '@/app/api/whatsapp/templates/submit/route'
import { DELETE as deleteTemplate } from '@/app/api/whatsapp/templates/[id]/route'
import { POST as addKnowledge } from '@/app/api/ai/knowledge/route'

export const maxDuration = 60

type Body = Record<string, unknown>

function secretOk(request: Request): boolean | null {
  const secret = process.env.AUTOSHIFT_INTERNAL_SECRET?.trim()
  if (!secret) return null
  const given = request.headers.get('x-autoshift-internal') ?? ''
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

/** Runs an existing route handler as this business, with a JSON body. */
async function asAccount(ctx: AccountContext, handler: (req: Request) => Promise<Response>, body?: unknown): Promise<Response> {
  const req = new Request('http://internal/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return runAsAccount(ctx, () => handler(req))
}

async function relay(res: Response) {
  const text = await res.text()
  return new NextResponse(text || '{}', { status: res.status, headers: { 'content-type': 'application/json' } })
}

export async function POST(request: Request) {
  const ok = secretOk(request)
  if (ok === null) return fail(503, 'The internal API is not configured')
  if (!ok) return fail(401, 'Not allowed')

  const body = (await request.json().catch(() => null)) as Body | null
  if (!body) return fail(400, 'Body must be JSON')
  const action = str(body.action)
  const accountId = str(body.account_id)
  const userId = str(body.user_id)
  const role = str(body.role)
  if (!action || !accountId || !userId || !role || !isAccountRole(role)) return fail(400, 'action, account_id, user_id and role are required')

  const db = supabaseAdmin()
  const { data: account } = await db.from('accounts').select('id, name').eq('id', accountId).maybeSingle()
  if (!account) return fail(404, 'Unknown business')
  const ctx: AccountContext = { supabase: db, userId, accountId, role, account: { id: account.id, name: account.name } }

  try {
    switch (action) {
      case 'send': {
        const type = str(body.type) ?? 'text'
        const template = (body.template && typeof body.template === 'object' ? body.template : null) as Body | null
        const params = template?.params
        const templateParams = Array.isArray(params) ? params.filter((p): p is string => typeof p === 'string') : undefined
        const templateMessageParams = params && !Array.isArray(params) ? params : undefined
        validateSendMessageParams({
          messageType: type,
          contentText: str(body.text),
          mediaUrl: str(body.media_url),
          templateName: str(template?.name),
          interactivePayload: null,
        })
        let conversationId = str(body.conversation_id)
        let contactId: string | null = null
        if (conversationId) {
          const { data } = await db.from('conversations').select('id, contact_id').eq('id', conversationId).eq('account_id', accountId).maybeSingle()
          if (!data) return fail(404, 'Conversation not found')
          contactId = data.contact_id
        } else {
          const to = str(body.to)
          if (!to) return fail(400, "'to' or 'conversation_id' is required")
          const resolved = await resolveConversationByPhone(db, accountId, to, str(body.name))
          conversationId = resolved.conversationId
          contactId = resolved.contactId
        }
        const result = await sendMessageToConversation(db, accountId, {
          conversationId,
          messageType: type,
          contentText: str(body.text),
          mediaUrl: str(body.media_url),
          filename: str(body.filename),
          templateName: str(template?.name),
          templateLanguage: str(template?.language),
          templateParams,
          templateMessageParams,
          senderId: userId,
        })
        return NextResponse.json({ message_id: result.messageId, whatsapp_message_id: result.whatsappMessageId, conversation_id: conversationId, contact_id: contactId }, { status: 201 })
      }

      case 'broadcast_create': {
        const recipients = Array.isArray(body.recipients) ? (body.recipients as Body[]) : []
        const plan = await createBroadcast(db, accountId, userId, {
          name: str(body.name),
          templateName: str(body.template_name) ?? '',
          templateLanguage: str(body.template_language),
          recipients: recipients.map((r) => ({
            to: typeof r?.to === 'string' ? r.to : '',
            params: Array.isArray(r?.params) ? (r.params as unknown[]).filter((p): p is string => typeof p === 'string') : undefined,
          })),
        })
        // A send time in the future: keep the frozen list and let the every-minute cron send it.
        const at = str(body.scheduled_at) ? new Date(str(body.scheduled_at)!) : null
        if (at && !Number.isNaN(at.getTime()) && at.getTime() > Date.now()) {
          await markBroadcastScheduled(db, plan.broadcastId, at)
          return NextResponse.json({ broadcast_id: plan.broadcastId, status: 'scheduled', scheduled_at: at.toISOString(), accepted: plan.planned.length, rejected: plan.rejected }, { status: 202 })
        }
        after(() => deliverBroadcast(db, plan))
        return NextResponse.json({ broadcast_id: plan.broadcastId, status: 'sending', accepted: plan.planned.length, rejected: plan.rejected }, { status: 202 })
      }

      case 'templates_sync':
        return relay(await asAccount(ctx, () => syncTemplates()))

      case 'templates_submit':
        return relay(await asAccount(ctx, submitTemplate, body.template ?? {}))

      case 'templates_delete': {
        const id = str(body.template_id)
        if (!id) return fail(400, 'template_id is required')
        return relay(await runAsAccount(ctx, () => deleteTemplate(new Request('http://internal/api', { method: 'DELETE' }), { params: Promise.resolve({ id }) })))
      }

      case 'knowledge_add':
        return relay(await asAccount(ctx, addKnowledge, { title: body.title, content: body.content }))

      default:
        return fail(400, `Unknown action: ${action}`)
    }
  } catch (err) {
    if (err instanceof SendMessageError || err instanceof BroadcastError) return fail(err.status, err.message)
    console.error('[internal/mcp] failed:', action, err)
    return fail(500, err instanceof Error ? err.message : 'Failed')
  }
}
