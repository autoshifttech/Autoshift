/**
 * Segments: saved groups of customers built from rules (tags, lead
 * temperature, city, last message, bookings, marketing opt-in…). Used to
 * target broadcasts and drip campaigns. Sample audience kept in the
 * browser until the contacts query runs on the backend.
 */
import { createStore, useStore } from '@/lib/workspace/store'

export interface Customer {
  id: string
  name: string
  phone: string
  city: string
  tags: string[]
  temp: 'hot' | 'warm' | 'cold' | null
  lastMessageDays: number
  bookings: number
  optedIn: boolean
  source: 'whatsapp_ad' | 'website' | 'campaign' | 'organic' | 'referral'
  joinedDays: number
}

export const SEGMENT_FIELDS = ['tag', 'temp', 'city', 'last_message', 'bookings', 'opted_in', 'source', 'joined'] as const
export type SegmentField = (typeof SEGMENT_FIELDS)[number]

export type SegmentOp = 'is' | 'is_not' | 'within' | 'older_than' | 'at_least' | 'none'

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
  bookings: ['at_least', 'none'],
  opted_in: ['is'],
  source: ['is', 'is_not'],
  joined: ['within', 'older_than'],
}

export const TAGS = ['Interested', 'VIP', 'Converted', 'Cold', 'Wholesale', 'Bridal']
export const CITIES = ['Chennai', 'Bengaluru', 'Coimbatore', 'Hyderabad', 'Mumbai', 'Kochi']
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
    case 'bookings':
      return r.op === 'none' ? c.bookings === 0 : c.bookings >= (Number.isFinite(n) ? n : 1)
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
      return TAGS[0]
    case 'temp':
      return 'hot'
    case 'city':
      return CITIES[0]
    case 'source':
      return SOURCES[0]
    case 'last_message':
    case 'joined':
      return '30'
    case 'bookings':
      return '1'
    case 'opted_in':
      return 'yes'
  }
}

// Deterministic sample audience (no Math.random so server and browser agree).
const FIRST = ['Priya', 'Arjun', 'Sara', 'Leo', 'Meena', 'Omar', 'Kavya', 'Rahul', 'Divya', 'Vikram', 'Lakshmi', 'Nisha', 'Farhan', 'Rekha', 'Karthik', 'Ananya', 'Rohan', 'Sneha', 'Imran', 'Pooja']
const LAST = ['Raman', 'Mehta', 'Thomas', 'Fernandes', 'Iyer', 'Hussain', 'Nair', 'Verma', 'Menon', 'Singh', 'Pillai', 'Kapoor', 'Ali', 'Das', 'Rao']

export function sampleAudience(size = 240): Customer[] {
  const temps: Customer['temp'][] = ['hot', 'warm', 'warm', 'cold', 'cold', null, null]
  return Array.from({ length: size }, (_, i) => {
    const h = (i * 2654435761) >>> 0
    const pick = <T,>(arr: readonly T[], salt: number) => arr[((h >>> salt) + i * salt) % arr.length]
    const tags = TAGS.filter((_, j) => ((h >>> (j + 3)) & 7) === 0)
    const digits = String(100_000_000 + (h % 899_999_999))
    return {
      id: `cu${i + 1}`,
      name: `${pick(FIRST, 1)} ${pick(LAST, 5)}`,
      phone: `+91 9${digits.slice(0, 4)} ${digits.slice(4)}`,
      city: pick(CITIES, 7),
      tags,
      temp: pick(temps, 11),
      lastMessageDays: (h >>> 4) % 120,
      bookings: (h >>> 9) % 5 === 0 ? 1 + ((h >>> 13) % 3) : 0,
      optedIn: (h >>> 2) % 5 !== 0,
      source: pick(SOURCES, 13),
      joinedDays: (h >>> 6) % 365,
    }
  })
}

const rule = (field: SegmentField, op: SegmentOp, value: string, i: number): SegmentRule => ({ id: `r${i}`, field, op, value })

export function sampleSegments(): Segment[] {
  const at = new Date(Date.UTC(2026, 8, 1)).toISOString()
  return [
    { id: 'sg-hot', name: 'Hot leads in Chennai', description: 'Ready to buy — follow up first.', match: 'all', rules: [rule('temp', 'is', 'hot', 1), rule('city', 'is', 'Chennai', 2)], createdAt: at },
    { id: 'sg-inactive', name: 'Quiet for 60+ days', description: 'Win-back offers.', match: 'all', rules: [rule('last_message', 'older_than', '60', 1), rule('opted_in', 'is', 'yes', 2)], createdAt: at },
    { id: 'sg-booked', name: 'Booked before', description: 'Customers with at least one appointment.', match: 'all', rules: [rule('bookings', 'at_least', '1', 1)], createdAt: at },
    { id: 'sg-vip', name: 'VIP or bridal', description: 'Priority customers for new collections.', match: 'any', rules: [rule('tag', 'is', 'VIP', 1), rule('tag', 'is', 'Bridal', 2)], createdAt: at },
  ]
}

export const AUDIENCE = sampleAudience()

export const segmentsStore = createStore<{ segments: Segment[] }>(() => ({ segments: sampleSegments() }), 'autoshift.segments')
const SERVER = { segments: sampleSegments() }
export const useSegments = () => useStore(segmentsStore, SERVER).segments
