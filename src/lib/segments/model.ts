/**
 * Segments: saved groups of customers built from rules (tags, lead
 * temperature, city, last message, marketing opt-in…). Used to
 * target broadcasts and drip campaigns. The audience is the account's real
 * contacts; saved segments are kept in this browser.
 */
import { useEffect } from 'react'
import { createStore, useStore } from '@/lib/workspace/store'
import { createClient } from '@/lib/supabase/client'
import { BLOCKED_TAG, isLive, keywordReplies, tagsByContact } from '@/lib/workspace/live'

export interface Customer {
  id: string
  name: string
  phone: string
  city: string
  tags: string[]
  temp: 'hot' | 'warm' | 'cold' | null
  lastMessageDays: number
  optedIn: boolean
  source: 'whatsapp_ad' | 'website' | 'campaign' | 'organic' | 'referral'
  joinedDays: number
}

export const SEGMENT_FIELDS = ['tag', 'temp', 'city', 'last_message', 'opted_in', 'source', 'joined'] as const
export type SegmentField = (typeof SEGMENT_FIELDS)[number]

export type SegmentOp = 'is' | 'is_not' | 'within' | 'older_than'

export interface SegmentRule {
  id: string
  field: SegmentField
  op: SegmentOp
  value: string
}

export interface Segment {
  id: string
  name: string
  description: string
  match: 'all' | 'any'
  rules: SegmentRule[]
  createdAt: string
}

/** Operators that make sense for each field, first one is the default. */
export const FIELD_OPS: Record<SegmentField, SegmentOp[]> = {
  tag: ['is', 'is_not'],
  temp: ['is', 'is_not'],
  city: ['is', 'is_not'],
  last_message: ['within', 'older_than'],
  opted_in: ['is'],
  source: ['is', 'is_not'],
  joined: ['within', 'older_than'],
}

export const SOURCES: Customer['source'][] = ['whatsapp_ad', 'website', 'campaign', 'organic', 'referral']

export function ruleMatches(c: Customer, r: SegmentRule): boolean {
  const n = Number(r.value)
  switch (r.field) {
    case 'tag':
      return r.op === 'is_not' ? !c.tags.includes(r.value) : c.tags.includes(r.value)
    case 'temp':
      return r.op === 'is_not' ? c.temp !== r.value : c.temp === r.value
    case 'city':
      return r.op === 'is_not' ? c.city !== r.value : c.city === r.value
    case 'source':
      return r.op === 'is_not' ? c.source !== r.value : c.source === r.value
    case 'last_message':
      return r.op === 'older_than' ? c.lastMessageDays > n : c.lastMessageDays <= n
    case 'joined':
      return r.op === 'older_than' ? c.joinedDays > n : c.joinedDays <= n
    case 'opted_in':
      return c.optedIn === (r.value !== 'no')
  }
}

export function members(segment: Pick<Segment, 'match' | 'rules'>, audience: Customer[]): Customer[] {
  if (segment.rules.length === 0) return audience
  return audience.filter((c) => (segment.match === 'all' ? segment.rules.every((r) => ruleMatches(c, r)) : segment.rules.some((r) => ruleMatches(c, r))))
}

export function defaultValue(field: SegmentField): string {
  switch (field) {
    case 'tag':
      return audienceStore.get().tags[0] ?? ''
    case 'temp':
      return 'hot'
    case 'city':
      return ''
    case 'source':
      return SOURCES[0]
    case 'last_message':
    case 'joined':
      return '30'
    case 'opted_in':
      return 'yes'
  }
}




// Real accounts start with no saved segments (kept in this browser under their own key) and
// build them from their real contacts.
export const segmentsStore = createStore<{ segments: Segment[] }>(() => ({ segments: [] }), 'autoshift.segments.live')
const SERVER = { segments: [] as Segment[] }
export const useSegments = () => useStore(segmentsStore, SERVER).segments

export interface Audience {
  customers: Customer[]
  tags: string[]
  cities: string[]
  loaded: boolean
}
const EMPTY_AUDIENCE: Audience = { customers: [], tags: [], cities: [], loaded: false }
export const audienceStore = createStore<Audience>(() => EMPTY_AUDIENCE)
let audienceLoad: Promise<void> | null = null

/** The people segments are built from: the account's real contacts. */
export function useAudience(): Audience {
  useEffect(() => {
    if (!isLive() || audienceLoad) return
    audienceLoad = fetchLiveAudience()
      .then((a) => audienceStore.set(a))
      .catch((err) => {
        console.error('[segments] audience load failed', err)
        audienceLoad = null
      })
  }, [])
  return useStore(audienceStore, EMPTY_AUDIENCE)
}

async function fetchLiveAudience(): Promise<Audience> {
  const sb = createClient()
  const { data: contacts, error } = await sb.from('contacts').select('id, name, phone, created_at').order('created_at', { ascending: false }).limit(5000)
  if (error) throw error
  const rows = contacts ?? []
  const ids = rows.map((c) => c.id)
  const [tags, replies] = await Promise.all([tagsByContact(ids), keywordReplies()])
  const lastIn = new Map<string, number>()
  const { data: convs } = await sb.from('conversations').select('contact_id, last_inbound_at').not('last_inbound_at', 'is', null).limit(10000)
  for (const c of convs ?? []) {
    const t = new Date(c.last_inbound_at).getTime()
    if (t > (lastIn.get(c.contact_id) ?? 0)) lastIn.set(c.contact_id, t)
  }
  const now = Date.now()
  const days = (t: number) => Math.max(0, Math.floor((now - t) / 864e5))
  const customers: Customer[] = rows.map((c) => ({
    id: c.id,
    name: c.name || c.phone,
    phone: c.phone,
    city: '',
    tags: tags.get(c.id) ?? [],
    temp: null,
    // Never written: treat as a long time ago, so "within N days" doesn't match them.
    lastMessageDays: lastIn.has(c.id) ? days(lastIn.get(c.id)!) : 9999,
    optedIn: replies.get(c.id)?.status !== 'opted_out' && !(tags.get(c.id) ?? []).some((t) => t.toLowerCase() === BLOCKED_TAG.toLowerCase()),
    source: 'organic',
    joinedDays: days(new Date(c.created_at).getTime()),
  }))
  const tagNames = [...new Set(customers.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b))
  return { customers, tags: tagNames, cities: [], loaded: true }
}
