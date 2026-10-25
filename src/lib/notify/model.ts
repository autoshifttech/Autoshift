/**
 * Which account events reach the business owner, and where: email,
 * WhatsApp (from the AutoShift number) or only inside the app. Kept in the
 * browser until the backend sends them.
 */
import { createStore, useStore } from '@/lib/workspace/store'

export const CHANNELS = ['email', 'whatsapp', 'app'] as const
export type Channel = (typeof CHANNELS)[number]

export const EVENT_GROUPS = {
  billing: ['trialEnding', 'paymentFailed', 'invoice', 'walletLow', 'walletEmpty'],
  whatsapp: ['templateApproved', 'templateRejected', 'qualityDropped', 'numberDisconnected'],
  customers: ['hotLead', 'newBooking', 'handoff', 'dailySummary'],
} as const

export type NotifyEvent = (typeof EVENT_GROUPS)[keyof typeof EVENT_GROUPS][number]
export const EVENTS = Object.values(EVENT_GROUPS).flat() as NotifyEvent[]

/** Events that matter too much to switch off everywhere. */
export const REQUIRED: NotifyEvent[] = ['paymentFailed', 'walletEmpty', 'numberDisconnected']

export interface NotifyPrefs {
  matrix: Record<NotifyEvent, Record<Channel, boolean>>
  emails: string[]
  whatsapp: string
  quietHours: { enabled: boolean; from: string; to: string }
  summaryTime: string
}

const on = (email: boolean, whatsapp: boolean, app = true) => ({ email, whatsapp, app })

export function defaultPrefs(): NotifyPrefs {
  return {
    matrix: {
      trialEnding: on(true, true),
      paymentFailed: on(true, true),
      invoice: on(true, false),
      walletLow: on(true, true),
      walletEmpty: on(true, true),
      templateApproved: on(false, false),
      templateRejected: on(true, false),
      qualityDropped: on(true, true),
      numberDisconnected: on(true, true),
      hotLead: on(false, true),
      newBooking: on(false, false),
      handoff: on(false, false),
      dailySummary: on(true, false, false),
    },
    emails: ['demo@autoshift.app'],
    whatsapp: '',
    quietHours: { enabled: true, from: '21:00', to: '08:00' },
    summaryTime: '09:00',
  }
}

/** A required event must stay on in at least one channel. */
export function canTurnOff(prefs: NotifyPrefs, event: NotifyEvent, channel: Channel): boolean {
  if (!REQUIRED.includes(event)) return true
  return CHANNELS.some((c) => c !== channel && prefs.matrix[event][c])
}

export const notifyStore = createStore(defaultPrefs, 'autoshift.notifyPrefs.v1')
const SERVER = defaultPrefs()
export const useNotifyPrefs = () => useStore(notifyStore, SERVER)
