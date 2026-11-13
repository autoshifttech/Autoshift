/**
 * Opt-in and opt-out: who agreed to get WhatsApp marketing from this
 * business, who said STOP, and numbers that are blocked. WhatsApp policy
 * requires opt-in before marketing, and messaging people who opted out
 * lowers the number's quality rating. Opt-outs come from customers' STOP/START
 * replies; the blocklist is contacts tagged "Blocked".
 */
import { useEffect } from 'react'
import { createStore, useStore } from '@/lib/workspace/store'
import { blockedContacts, contactsById, isLive, keywordReplies, setBlocked } from '@/lib/workspace/live'

export const CONSENT_SOURCES = ['website', 'keyword', 'ad', 'import', 'manual'] as const
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
  collect: { website: true, keyword: true, ad: true, import: false },
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


// Real accounts: STOP/START replies come from their chats and the blocklist from contacts tagged
// "Blocked"; only the rules and manual changes are kept in this browser.
const empty = (): ConsentState => ({ settings: DEFAULT_SETTINGS, records: [], blocked: [] })
export const consentStore = createStore<ConsentState>(empty, 'autoshift.consent.live')
const SERVER = empty()
let liveLoad: Promise<void> | null = null

export function loadLiveConsent(force = false): Promise<void> {
  if (!isLive()) return Promise.resolve()
  if (!liveLoad || force) {
    liveLoad = (async () => {
      const { settings } = consentStore.get()
      const [replies, blocked] = await Promise.all([keywordReplies(settings.optOutKeywords, settings.optInKeywords), blockedContacts()])
      const people = await contactsById([...replies.keys()])
      const fromChats: ConsentRecord[] = [...replies.entries()].map(([cid, r]) => ({
        id: `kw-${cid}`,
        name: people.get(cid)?.name || people.get(cid)?.phone || '',
        phone: people.get(cid)?.phone ?? '',
        status: r.status,
        source: 'keyword',
        evidence: r.word,
        at: r.at,
      }))
      consentStore.set((s) => ({
        ...s,
        // Manual changes made in this browser stay on top of what the chats say.
        records: [...s.records.filter((x) => x.source === 'manual'), ...fromChats],
        blocked: blocked.map((c) => ({ phone: c.phone, name: c.name || c.phone, reason: '', at: c.created_at })),
      }))
    })().catch((err) => {
      console.error('[opt-ins] load failed', err)
      liveLoad = null
    })
  }
  return liveLoad
}

export const useConsent = () => {
  useEffect(() => {
    void loadLiveConsent()
  }, [])
  return useStore(consentStore, SERVER)
}

/** Blocks or unblocks a number (tags the contact "Blocked"). */
export async function saveBlocked(phone: string, blocked: boolean, name?: string): Promise<void> {
  if (!isLive()) return
  await setBlocked(phone, blocked, name)
}
