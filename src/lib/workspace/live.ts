/**
 * Real data for leads, insights, segments,
 * opt-ins, files). With Supabase configured (a real account) these read the account's own
 * rows through the signed-in client, so row-level security limits them to that business.
 */
import { createClient } from '@/lib/supabase/client'
import { supabasePublicConfig } from '@/lib/supabase/config'

/** True when Supabase is configured (always, for a working AutoShift). */
export const isLive = () => supabasePublicConfig().configured

export const OPT_OUT_WORDS = ['STOP', 'STOP ALL', 'UNSUBSCRIBE', 'CANCEL', 'OPT OUT', 'OPTOUT']
export const OPT_IN_WORDS = ['START', 'SUBSCRIBE', 'UNSTOP', 'OPT IN']
export const BLOCKED_TAG = 'Blocked'
const MAX = 5000

export const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')
const keyword = (text: string | null | undefined) => (text ?? '').trim().toUpperCase().replace(/[.!]+$/, '')

function chunks<T>(items: T[], size = 150): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export interface LiveContact {
  id: string
  name: string | null
  phone: string
  created_at: string
}

export async function contactsById(ids: string[]): Promise<Map<string, LiveContact>> {
  const sb = createClient()
  const out = new Map<string, LiveContact>()
  for (const part of chunks([...new Set(ids.filter(Boolean))])) {
    const { data } = await sb.from('contacts').select('id, name, phone, created_at').in('id', part)
    for (const c of data ?? []) out.set(c.id, c as LiveContact)
  }
  return out
}

/** Tag names per contact id. */
export async function tagsByContact(contactIds: string[]): Promise<Map<string, string[]>> {
  const sb = createClient()
  const { data: tags } = await sb.from('tags').select('id, name')
  const names = new Map((tags ?? []).map((t) => [t.id as string, t.name as string]))
  const out = new Map<string, string[]>()
  for (const part of chunks(contactIds)) {
    const { data } = await sb.from('contact_tags').select('contact_id, tag_id').in('contact_id', part)
    for (const l of data ?? []) {
      const n = names.get(l.tag_id)
      if (n) out.set(l.contact_id, [...(out.get(l.contact_id) ?? []), n])
    }
  }
  return out
}

/** Each contact's latest STOP/START-style keyword: who opted out or back in, and when. */
export async function keywordReplies(optOut = OPT_OUT_WORDS, optIn = OPT_IN_WORDS): Promise<Map<string, { word: string; status: 'opted_out' | 'opted_in'; at: string }>> {
  const sb = createClient()
  const words = [...new Set([...optOut, ...optIn].map((w) => w.trim()).filter(Boolean))]
  if (words.length === 0) return new Map()
  // ilike without wildcards = case-insensitive equals. Commas and brackets would break the filter.
  const filter = words.filter((w) => !/[,()*]/.test(w)).map((w) => `content_text.ilike.${w}`).join(',')
  const { data: msgs } = await sb.from('messages').select('conversation_id, content_text, created_at').eq('sender_type', 'customer').or(filter).order('created_at', { ascending: false }).limit(MAX)
  const convIds = [...new Set((msgs ?? []).map((m) => m.conversation_id as string))]
  const convContact = new Map<string, string>()
  for (const part of chunks(convIds)) {
    const { data } = await sb.from('conversations').select('id, contact_id').in('id', part)
    for (const c of data ?? []) convContact.set(c.id, c.contact_id)
  }
  const outSet = new Set(optOut.map(keyword))
  const out = new Map<string, { word: string; status: 'opted_out' | 'opted_in'; at: string }>()
  for (const m of msgs ?? []) {
    const cid = convContact.get(m.conversation_id)
    if (!cid || out.has(cid)) continue // newest first: the first one seen is the latest
    const w = keyword(m.content_text)
    out.set(cid, { word: w, status: outSet.has(w) ? 'opted_out' : 'opted_in', at: m.created_at })
  }
  return out
}

/** Contacts tagged Blocked. */
export async function blockedContacts(): Promise<LiveContact[]> {
  const sb = createClient()
  const { data: tag } = await sb.from('tags').select('id').ilike('name', BLOCKED_TAG).limit(1).maybeSingle()
  if (!tag) return []
  const { data: links } = await sb.from('contact_tags').select('contact_id').eq('tag_id', tag.id)
  return [...(await contactsById((links ?? []).map((l) => l.contact_id))).values()]
}

async function myAccount(): Promise<{ accountId: string; userId: string }> {
  const sb = createClient()
  const { data: auth } = await sb.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { data } = await sb.from('profiles').select('account_id').eq('user_id', auth.user.id).maybeSingle()
  if (!data?.account_id) throw new Error('No workspace')
  return { accountId: data.account_id, userId: auth.user.id }
}

/** Block (tag Blocked) or unblock a phone number. Creates the contact when blocking a new number. */
export async function setBlocked(phone: string, blocked: boolean, name?: string): Promise<void> {
  const sb = createClient()
  const { accountId, userId } = await myAccount()
  const d = digits(phone)
  let { data: contact } = await sb.from('contacts').select('id').eq('phone_normalized', d).limit(1).maybeSingle()
  if (!contact) {
    if (!blocked) return
    const made = await sb.from('contacts').insert({ account_id: accountId, user_id: userId, phone: `+${d}`, name: name || null }).select('id').single()
    if (made.error) throw new Error(made.error.message)
    contact = made.data
  }
  let { data: tag } = await sb.from('tags').select('id').ilike('name', BLOCKED_TAG).limit(1).maybeSingle()
  if (!tag) {
    if (!blocked) return
    const made = await sb.from('tags').insert({ account_id: accountId, user_id: userId, name: BLOCKED_TAG, color: '#64748b' }).select('id').single()
    if (made.error) throw new Error(made.error.message)
    tag = made.data
  }
  if (blocked) {
    const { error } = await sb.from('contact_tags').upsert({ contact_id: contact!.id, tag_id: tag!.id }, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await sb.from('contact_tags').delete().eq('contact_id', contact!.id).eq('tag_id', tag!.id)
    if (error) throw new Error(error.message)
  }
}

export { myAccount }
