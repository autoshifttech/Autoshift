/**
 * Opt-in and opt-out: who agreed to get WhatsApp marketing from this
 * business, who said STOP, and numbers that are blocked. WhatsApp policy
 * requires opt-in before marketing, and messaging people who opted out
 * lowers the number's quality rating. Sample data in the browser until the
 * backend reads replies from Meta's webhook.
 */
import { createStore, useStore } from '@/lib/workspace/store'

export const CONSENT_SOURCES = ['website', 'keyword', 'ad', 'booking', 'import', 'manual'] as const
export type ConsentSource = (typeof CONSENT_SOURCES)[number]
export type ConsentStatus = 'opted_in' | 'opted_out'

export interface ConsentRecord {
  id: string
  name: string
  phone: string
  status: ConsentStatus
  source: ConsentSource
  /** What they sent or ticked, e.g. "STOP" or the website checkbox text. */
  evidence: string
  at: string
}

export interface BlockedNumber {
  phone: string
  name: string
  reason: string
  at: string
}

export interface ConsentSettings {
  optOutKeywords: string[]
  optInKeywords: string[]
  optOutReply: string
  optInReply: string
  /** Send the confirmation reply after an opt-out (allowed once by WhatsApp). */
  confirmOptOut: boolean
  /** Only send marketing to people with an opt-in on record. */
  requireOptIn: boolean
  /** Ways customers can opt in. */
  collect: Record<Exclude<ConsentSource, 'manual'>, boolean>
  checkboxText: string
}

export interface ConsentState {
  settings: ConsentSettings
  records: ConsentRecord[]
  blocked: BlockedNumber[]
}

export const DEFAULT_SETTINGS: ConsentSettings = {
  optOutKeywords: ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'STOP ALL'],
  optInKeywords: ['START', 'SUBSCRIBE', 'YES'],
  optOutReply: "You won't get offers from us on WhatsApp any more. Reply START if you change your mind.",
  optInReply: "Thanks! You'll now get our offers and updates on WhatsApp. Reply STOP any time to stop.",
  confirmOptOut: true,
  requireOptIn: true,
  collect: { website: true, keyword: true, ad: true, booking: true, import: false },
  checkboxText: 'Send me offers and updates on WhatsApp. I can reply STOP any time.',
}

/** Normalise to compare keywords: case, spaces and punctuation don't matter. */
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

/** What a customer's reply means: an opt-out, an opt-in, or nothing. */
export function classifyReply(text: string, s: Pick<ConsentSettings, 'optOutKeywords' | 'optInKeywords'>): 'opt_out' | 'opt_in' | null {
  const t = norm(text)
  if (!t) return null
  if (s.optOutKeywords.some((k) => norm(k) === t)) return 'opt_out'
  if (s.optInKeywords.some((k) => norm(k) === t)) return 'opt_in'
  return null
}

/** Digits only, so +91 98765 43210 and 919876543210 match. */
export const phoneKey = (p: string) => p.replace(/\D/g, '')

export const isValidPhone = (p: string) => phoneKey(p).length >= 10 && phoneKey(p).length <= 15

/** Who must be skipped when sending marketing. */
export function excludedPhones(state: Pick<ConsentState, 'records' | 'blocked'>): Set<string> {
  const out = new Set(state.blocked.map((b) => phoneKey(b.phone)))
  // The latest record per number wins.
  const latest = new Map<string, ConsentRecord>()
  for (const r of state.records) {
    const k = phoneKey(r.phone)
    const prev = latest.get(k)
    if (!prev || prev.at < r.at) latest.set(k, r)
  }
  for (const [k, r] of latest) if (r.status === 'opted_out') out.add(k)
  return out
}

function sample(): ConsentState {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 25, 9) - h * 36e5).toISOString()
  const r = (id: string, name: string, phone: string, status: ConsentStatus, source: ConsentSource, evidence: string, h: number): ConsentRecord => ({ id, name, phone, status, source, evidence, at: at(h) })
  return {
    settings: DEFAULT_SETTINGS,
    records: [
      r('c1', 'Neha Gupta', '+91 98450 22113', 'opted_out', 'keyword', 'STOP', 2),
      r('c2', 'Priya Raman', '+91 98765 43210', 'opted_in', 'website', DEFAULT_SETTINGS.checkboxText, 5),
      r('c3', 'Arjun Mehta', '+91 99620 11873', 'opted_in', 'ad', 'Clicked “Festive sale” ad and messaged first', 9),
      r('c4', 'Vikram Rao', '+91 90030 55621', 'opted_out', 'keyword', 'Unsubscribe', 20),
      r('c5', 'Sara Thomas', '+91 97410 88234', 'opted_in', 'booking', 'Ticked WhatsApp updates while booking', 26),
      r('c6', 'Leo Fernandes', '+91 98201 67745', 'opted_in', 'keyword', 'START', 31),
      r('c7', 'Meena Iyer', '+91 94440 11290', 'opted_in', 'import', 'Imported from POS list with consent column', 48),
      r('c8', 'Rohit Shah', '+91 98190 33421', 'opted_out', 'keyword', 'stop all', 60),
      r('c9', 'Ananya Das', '+91 90071 22984', 'opted_in', 'website', DEFAULT_SETTINGS.checkboxText, 77),
      r('c10', 'Karan Malhotra', '+91 98110 45567', 'opted_in', 'manual', 'Agreed on a phone call', 96),
      r('c11', 'Divya Nair', '+91 94950 66012', 'opted_out', 'manual', 'Asked in chat not to get offers', 130),
      r('c12', 'Imran Khan', '+91 98330 77104', 'opted_in', 'ad', 'Clicked “New arrivals” ad', 150),
    ],
    blocked: [
      { phone: '+91 70000 12345', name: 'Unknown', reason: 'Abusive messages', at: at(40) },
      { phone: '+91 81234 99887', name: 'Spam sender', reason: 'Sends promotions to our number', at: at(200) },
    ],
  }
}

export const consentStore = createStore<ConsentState>(sample, 'autoshift.consent.v1')
const SERVER = sample()
export const useConsent = () => useStore(consentStore, SERVER)
