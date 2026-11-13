// ============================================================
// Scheduled broadcasts: a broadcast created with a send time is saved as 'scheduled' with its
// recipient list frozen, and the every-minute cron sends it once the time comes.
//
// Sending reuses the resume path (claim lock → plan pending recipients → deliver), so a due
// broadcast picked up by two overlapping cron runs is still sent only once.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

import { deliverBroadcast, finalizeBroadcastStatus } from './broadcast-core'
import { claimBroadcastDelivery, markBroadcastSending, planBroadcastResume, releaseBroadcastDelivery } from './broadcast-resume'

/** Broadcasts started per cron run; the rest wait a minute. */
const DUE_PER_RUN = 5

// Same words as the backend's opt-out check (backend/app/routers/workspace_ops.py).
const OPT_OUT = new Set(['STOP', 'STOP ALL', 'UNSUBSCRIBE', 'CANCEL', 'OPT OUT', 'OPTOUT'])
const OPT_IN = new Set(['START', 'SUBSCRIBE', 'UNSTOP', 'OPT IN'])
const keyword = (t: string | null | undefined) => (t ?? '').trim().toUpperCase().replace(/[.!]+$/, '')

function chunks<T>(items: T[], size = 150): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Recipient rows whose contact said STOP (latest keyword) or was blocked since the broadcast was
 * scheduled. Never message opted-out or blocked people, even on a send planned days ago.
 */
export async function recipientsNowExcluded(db: SupabaseClient, accountId: string, recipientRowIds: string[]): Promise<Set<string>> {
  const rowContact = new Map<string, string>()
  for (const part of chunks(recipientRowIds)) {
    const { data } = await db.from('broadcast_recipients').select('id, contact_id').in('id', part)
    for (const r of data ?? []) if (r.contact_id) rowContact.set(r.id as string, r.contact_id as string)
  }
  const contacts = [...new Set(rowContact.values())]
  const excluded = new Set<string>()
  if (contacts.length === 0) return excluded

  const { data: tag } = await db.from('tags').select('id').eq('account_id', accountId).ilike('name', 'Blocked').limit(1).maybeSingle()
  if (tag) {
    for (const part of chunks(contacts)) {
      const { data } = await db.from('contact_tags').select('contact_id').eq('tag_id', tag.id).in('contact_id', part)
      for (const l of data ?? []) excluded.add(l.contact_id as string)
    }
  }

  const convContact = new Map<string, string>()
  for (const part of chunks(contacts)) {
    const { data } = await db.from('conversations').select('id, contact_id').eq('account_id', accountId).in('contact_id', part)
    for (const c of data ?? []) convContact.set(c.id as string, c.contact_id as string)
  }
  const latest = new Map<string, string>()
  const words = [...OPT_OUT, ...OPT_IN].map((w) => `content_text.ilike."${w}"`).join(',')
  for (const part of chunks([...convContact.keys()])) {
    const { data } = await db.from('messages').select('conversation_id, content_text, created_at').eq('sender_type', 'customer').in('conversation_id', part).or(words).order('created_at', { ascending: false }).limit(5000)
    for (const m of data ?? []) {
      const cid = convContact.get(m.conversation_id as string)
      if (cid && !latest.has(cid)) latest.set(cid, keyword(m.content_text as string))
    }
  }
  for (const [cid, word] of latest) if (OPT_OUT.has(word)) excluded.add(cid)

  return new Set([...rowContact].filter(([, cid]) => excluded.has(cid)).map(([rowId]) => rowId))
}

/** Turn a just-created broadcast into a scheduled one (nothing has been sent yet). */
export async function markBroadcastScheduled(db: SupabaseClient, broadcastId: string, at: Date): Promise<void> {
  const { error } = await db
    .from('broadcasts')
    .update({ status: 'scheduled', scheduled_at: at.toISOString(), updated_at: new Date().toISOString() })
    .eq('id', broadcastId)
  if (error) throw new Error(`Could not schedule the broadcast: ${error.message}`)
}

/** Send every scheduled broadcast whose time has come. Returns how many were started. */
export async function sendDueScheduledBroadcasts(db: SupabaseClient, now: Date = new Date()): Promise<number> {
  const { data: due, error } = await db
    .from('broadcasts')
    .select('id, account_id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(DUE_PER_RUN)
  if (error || !due) return 0

  let started = 0
  for (const row of due as { id: string; account_id: string }[]) {
    if (!(await claimBroadcastDelivery(db, row.account_id, row.id, now))) continue
    try {
      const { plan } = await planBroadcastResume(db, row.account_id, row.id, 'pending')
      const skip = await recipientsNowExcluded(db, row.account_id, plan.planned.map((p) => p.recipientRowId))
      if (skip.size > 0) {
        plan.planned = plan.planned.filter((p) => !skip.has(p.recipientRowId))
        for (const part of chunks([...skip])) {
          await db.from('broadcast_recipients').update({ status: 'failed', error_message: 'Opted out or blocked before the send time' }).in('id', part)
        }
      }
      await markBroadcastSending(db, row.id)
      await deliverBroadcast(db, plan)
      started++
    } catch (err) {
      console.error('[broadcast-schedule] send failed:', row.id, err instanceof Error ? err.message : err)
      await finalizeBroadcastStatus(db, row.id).catch(() => {})
    } finally {
      await releaseBroadcastDelivery(db, row.id)
    }
  }
  return started
}
