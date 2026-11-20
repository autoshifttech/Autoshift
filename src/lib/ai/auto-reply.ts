import { supabaseAdmin } from './admin-client'
import { loadAiConfig } from './config'
import { buildConversationContext } from './context'
import { retrieveKnowledge } from './knowledge'
import { generateReply } from './generate'
import { buildSystemPrompt } from './defaults'
import { buildHandoffSummary } from './handoff'
import { logAiUsage } from './usage'
import { latestUserMessage } from './query'
import {
  engineSendInteractiveButtons,
  engineSendText,
  loadAccountMetaCredentials,
} from '@/lib/flows/meta-send'
import { sendTypingIndicator } from '@/lib/whatsapp/meta-api'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { assistantReply, internalConfigured } from '@/lib/backend/internal'

interface DispatchArgs {
  /** Tenancy key — drives config, contact, and whatsapp_config lookups. */
  accountId: string
  conversationId: string
  contactId: string
  /** The account's WhatsApp config owner, used for the outbound send's
   *  audit columns (mirrors how the flow runner passes it through). */
  configOwnerUserId: string
  /** Meta's wamid of the customer message we're replying to. When set,
   *  a typing indicator (which also marks it read) is shown while the
   *  reply is generated. Optional so older callers keep working. */
  inboundMessageId?: string
}

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * Invoked from the WhatsApp webhook's `after()` block, only when no
 * deterministic flow consumed the message (flows win). Mirrors the flow
 * runner's contract: it owns its try/catch and NEVER throws — a failing
 * or slow LLM call must not affect the webhook's 200 to Meta.
 *
 * Eligibility gates (any → silent no-op):
 *   - AI off / auto-reply disabled for the account
 *   - a human agent is assigned (they own the thread)
 *   - auto-reply was disabled for this conversation (prior handoff)
 *   - the per-conversation reply cap is reached
 *   - there's nothing to reply to
 *
 * The 24h WhatsApp session window is inherently open here — we're
 * reacting to a customer message that just landed — so no separate
 * window check is needed.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs,
): Promise<void> {
  const {
    accountId,
    conversationId,
    contactId,
    configOwnerUserId,
    inboundMessageId,
  } = args

  try {
    const db = supabaseAdmin()

    const config = await loadAiConfig(db, accountId)
    if (!config || !config.autoReplyEnabled) {
      // No own-key AI set up: use the business's switched-on AI assistant (platform AI, wallet-charged).
      await replyWithAssistant(db, args)
      return
    }

    // Deterministic, user-configured responders win over the LLM — the
    // caller already excludes messages a Flow consumed. Message-level
    // automations (`new_message_received` / `keyword_match`) are
    // dispatched independently for this same inbound and may send their
    // own reply, so if the account has any active one we stand down to
    // avoid double-texting the customer. (Relationship triggers like
    // `first_inbound_message` don't count — they're not per-message
    // auto-responders.)
    const { data: autoResponders } = await db
      .from('automations')
      .select('id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .in('trigger_type', ['new_message_received', 'keyword_match'])
      .limit(1)
    if (autoResponders && autoResponders.length > 0) return

    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr || !conv) return
    if (conv.assigned_agent_id) return // a human owns this thread
    if (conv.ai_autoreply_disabled) return // handed off / turned off here
    // Cheap early-out; the authoritative cap check is the atomic claim
    // below (this read can race a concurrent inbound).
    if (conv.ai_reply_count >= config.autoReplyMaxPerConversation) return

    const messages = await buildConversationContext(db, conversationId)
    if (messages.length === 0) return

    // Account-wide throttle on the shared BYO key. The per-conversation
    // cap bounds one thread; this bounds a burst across many threads (a
    // marketing blast landing 200 replies at once) so we never run the
    // owner's key past the provider's rate limit. Over the limit → skip
    // the auto-reply; the inbound still sits in the inbox for a human.
    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount,
    )
    if (!acctLimit.success) {
      console.warn(
        `[ai auto-reply] account ${accountId} hit the per-account rate limit — skipping this inbound.`,
      )
      return
    }

    // Every gate has passed — we're committed to attempting a reply, so
    // show the customer "typing…" (and mark their message read) while the
    // retrieval + LLM round trips run. Meta clears the indicator after
    // 25 s or when our reply lands, whichever is first, so there's
    // nothing to undo on the handoff / no-text path. Strictly
    // best-effort: a failed indicator must never cost us the reply.
    if (inboundMessageId) {
      await showTypingIndicator(db, accountId, inboundMessageId)
    }

    // Ground the reply in the account's knowledge base (best-effort).
    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      config,
      latestUserMessage(messages),
    )

    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge,
    })

    const { text, handoff, usage } = await generateReply({
      config,
      systemPrompt,
      messages,
    })

    // Record token spend on the account's BYO key. Fire-and-forget so it
    // never adds latency to the customer-facing send: `logAiUsage`
    // swallows its own errors, so the floating promise can't reject.
    // Logged regardless of handoff — the provider call happened either
    // way.
    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: config.provider,
      model: config.model,
      usage,
    })

    if (handoff || !text) {
      // The model can't (or shouldn't) answer — stop auto-replying on
      // this thread and hand it to a human. We (a) pause the bot here
      // (sticky until re-enabled), (b) route the conversation to the
      // configured handoff agent — null leaves it in the shared queue —
      // and (c) leave a short internal note so whoever picks it up has
      // context. Assigning fires the `on_conversation_assigned` trigger,
      // which notifies the agent.
      const summary = buildHandoffSummary({
        messages,
        replyCount: conv.ai_reply_count ?? 0,
      })
      const update: Record<string, unknown> = {
        ai_autoreply_disabled: true,
        ai_handoff_summary: summary,
      }
      // Only set the assignee when a target is configured AND the thread
      // isn't already owned — never stomp an existing human assignment.
      if (config.handoffAgentId && !conv.assigned_agent_id) {
        update.assigned_agent_id = config.handoffAgentId
      }
      await db.from('conversations').update(update).eq('id', conversationId)
      return
    }

    if (
      inboundMessageId &&
      (await hasNewerInbound(db, conversationId, inboundMessageId))
    ) {
      return
    }

    // Atomically claim a reply slot: the cap check + increment happen in
    // one UPDATE, so concurrent inbounds can never overshoot the cap. If
    // another inbound just took the last slot, `claimed` is false and we
    // skip the send. (We consume a slot slightly before the send lands —
    // fail-safe: under-reply rather than over-reply.)
    const { data: claimed, error: claimErr } = await db.rpc(
      'claim_ai_reply_slot',
      {
        conversation_id: conversationId,
        max_replies: config.autoReplyMaxPerConversation,
      },
    )
    if (claimErr) {
      // A real error here (vs. losing the cap race) is almost always a
      // deploy issue — e.g. `claim_ai_reply_slot` not EXECUTE-able by the
      // service role, or the migration not applied. Log it loudly: a
      // silent return makes "auto-reply never fires" undiagnosable.
      console.error('[ai auto-reply] claim_ai_reply_slot failed:', claimErr)
      return
    }
    if (claimed !== true) return

    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text,
      aiGenerated: true,
    })
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err)
  }
}

async function hasNewerInbound(
  db: ReturnType<typeof supabaseAdmin>,
  conversationId: string,
  inboundMessageId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('messages')
    .select('message_id')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error || !data || data.length === 0) return false
  return data[0].message_id !== inboundMessageId
}

/**
 * Best-effort "typing…" for the inbound we're about to answer. Swallows
 * every failure (no WhatsApp config, bad token, Meta 4xx) with a warning
 * — the indicator is cosmetic, the reply is not.
 */
async function showTypingIndicator(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  inboundMessageId: string,
): Promise<void> {
  try {
    const { phoneNumberId, accessToken } = await loadAccountMetaCredentials(
      db,
      accountId,
    )
    await sendTypingIndicator({
      phoneNumberId,
      accessToken,
      messageId: inboundMessageId,
    })
  } catch (err) {
    console.warn('[ai auto-reply] typing indicator failed (continuing):', err)
  }
}

/** Same gates as the own-key path: automations and humans win, handed-off chats stay quiet. */
async function replyWithAssistant(db: ReturnType<typeof supabaseAdmin>, args: DispatchArgs): Promise<void> {
  const { accountId, conversationId, contactId, configOwnerUserId, inboundMessageId } = args
  if (!internalConfigured()) return
  const { data: assistant } = await db
    .from('assistants')
    .select('id')
    .eq('account_id', accountId)
    .eq('enabled', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!assistant) return

  const { data: autoResponders } = await db
    .from('automations')
    .select('id')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .in('trigger_type', ['new_message_received', 'keyword_match'])
    .limit(1)
  if (autoResponders && autoResponders.length > 0) return

  const { data: conv } = await db
    .from('conversations')
    .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conv || conv.assigned_agent_id || conv.ai_autoreply_disabled) return

  const messages = await buildConversationContext(db, conversationId)
  if (messages.length === 0) return
  const message = latestUserMessage(messages)
  if (!message) return
  const lastUser = messages.map((m) => m.role).lastIndexOf('user')
  const history = messages.slice(0, lastUser).map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.content }))

  // The reply limit counts only the last 24 hours, so a returning customer isn't handed off for old chats,
  // and starts again after each order the shop assistant placed, so a customer can order again the same day.
  const { data: lastOrder } = await db
    .from('shop_orders')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const since = lastOrder?.created_at && String(lastOrder.created_at) > dayAgo ? String(lastOrder.created_at) : dayAgo
  const { count: recentAiReplies } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('ai_generated', true)
    .gte('created_at', since)

  // The customer's number, so a shop order's payment link is made out to them.
  const { data: contact } = await db.from('contacts').select('phone').eq('id', contactId).maybeSingle()

  if (inboundMessageId) await showTypingIndicator(db, accountId, inboundMessageId)
  const out = await assistantReply({
    accountId,
    assistantId: assistant.id as string,
    message,
    history,
    ref: inboundMessageId || `${conversationId}:${messages.length}`,
    recentAiReplies: recentAiReplies ?? undefined,
    conversationId,
    contactId,
    customerPhone: (contact?.phone as string | null) ?? null,
  })
  if (!out) return

  if (out.status === 'handoff') {
    const summary = buildHandoffSummary({ messages, replyCount: conv.ai_reply_count ?? 0 })
    await db.from('conversations').update({ ai_autoreply_disabled: true, ai_handoff_summary: summary }).eq('id', conversationId)
    // A shop assistant tells the customer a person will reply, rather than going quiet.
    if (out.text) await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: out.text, aiGenerated: true })
    return
  }
  if (out.status !== 'reply' || !out.text) {
    if (out.status !== 'off') console.warn(`[ai auto-reply] assistant gave no reply for ${accountId}: ${out.status} ${out.reason}`)
    return
  }
  // A newer message will get its own reply, except when this one placed an order: its summary and payment link must arrive.
  if (!out.order && inboundMessageId && (await hasNewerInbound(db, conversationId, inboundMessageId))) return
  const buttons = (out.buttons ?? []).filter((b) => b.trim()).slice(0, 3)
  if (buttons.length > 0 && !out.order) {
    await sendWithButtons({ accountId, userId: configOwnerUserId, conversationId, contactId, text: out.text, buttons })
    return
  }
  await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: out.text, aiGenerated: true })
}

/** Ids of AI tap-buttons start with this, so the webhook sends their taps back to the AI. */
export const AI_BUTTON_PREFIX = 'ai:'
const MAX_BODY = 1024

/**
 * The reply with WhatsApp reply buttons (e.g. Pay online / Cash on delivery). A long reply goes first as
 * text, then its last paragraph with the buttons. If WhatsApp refuses the buttons, the choices are sent as text.
 */
async function sendWithButtons(args: { accountId: string; userId: string; conversationId: string; contactId: string; text: string; buttons: string[] }): Promise<void> {
  const { text, buttons, ...who } = args
  const asButtons = buttons.map((title, i) => ({ id: `${AI_BUTTON_PREFIX}${i + 1}`, title: title.slice(0, 20) }))
  let body = text
  if (body.length > MAX_BODY) {
    const cut = body.lastIndexOf('\n\n')
    const tail = cut > 0 ? body.slice(cut + 2).trim() : ''
    const head = cut > 0 && tail.length <= MAX_BODY ? body.slice(0, cut).trim() : body
    body = cut > 0 && tail.length <= MAX_BODY ? tail : '👇'
    await engineSendText({ ...who, text: head, aiGenerated: true })
  }
  try {
    await engineSendInteractiveButtons({ ...who, bodyText: body, buttons: asButtons, aiGenerated: true })
  } catch (err) {
    console.warn('[ai auto-reply] buttons refused, sending the choices as text:', err)
    await engineSendText({ ...who, text: `${body}\n\n${buttons.map((b) => `• ${b}`).join('\n')}`, aiGenerated: true })
  }
}
