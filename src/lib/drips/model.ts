/**
 * Drip campaigns: a sequence of WhatsApp template messages sent over time
 * to people who enter a trigger (a segment, a tag, a new lead, a booking).
 * Each step waits, checks a condition and sends a template. Sample data
 * kept in the browser until the scheduler exists on the backend.
 */
import { createStore, useStore } from '@/lib/workspace/store'
import { RATES } from '@/lib/wallet/model'

export const TRIGGERS = ['segment', 'new_lead', 'tag_added', 'after_booking', 'manual'] as const
export type TriggerKind = (typeof TRIGGERS)[number]
export const CONDITIONS = ['always', 'not_replied', 'not_booked', 'not_read'] as const
export type StepCondition = (typeof CONDITIONS)[number]
export type DelayUnit = 'minutes' | 'hours' | 'days'
export type DripStatus = 'active' | 'paused' | 'draft'

export interface DripTemplate {
  name: string
  category: 'marketing' | 'utility'
  body: string
  buttons: string[]
}

/** Approved templates available to drips (sample). */
export const DRIP_TEMPLATES: DripTemplate[] = [
  { name: 'new_lead_welcome', category: 'utility', body: 'Hi {{name}}, thanks for your interest in Olive & Thread! Here’s our latest catalogue. Reply with any questions — we’re happy to help.', buttons: ['View catalogue'] },
  { name: 'site_visit_invite', category: 'marketing', body: 'Hi {{name}}, would you like to visit our store this week? Pick a time and we’ll keep a stylist ready for you.', buttons: ['Book a visit', 'Not now'] },
  { name: 'limited_offer', category: 'marketing', body: 'Hi {{name}}, just for you: 15% off your first order until Sunday. Use code WELCOME15.', buttons: ['Shop now'] },
  { name: 'last_chance', category: 'marketing', body: 'Hi {{name}}, your 15% welcome offer ends tonight. Want us to hold your size?', buttons: ['Yes, hold it', 'No thanks'] },
  { name: 'win_back_offer', category: 'marketing', body: 'We miss you, {{name}}! Here’s ₹300 off your next visit — valid for 14 days.', buttons: ['Book now'] },
  { name: 'visit_feedback', category: 'utility', body: 'Thanks for visiting, {{name}}! How was your experience? Reply with a number from 1 to 5.', buttons: ['5 ⭐', '4 ⭐', '3 or less'] },
  { name: 'review_request', category: 'marketing', body: 'Glad you loved it, {{name}}! Would you leave us a quick Google review? It really helps.', buttons: ['Leave a review'] },
]

export interface DripStep {
  id: string
  delay: number
  unit: DelayUnit
  template: string
  condition: StepCondition
  stats: { sent: number; read: number; replied: number }
}

export interface Drip {
  id: string
  name: string
  status: DripStatus
  trigger: { kind: TriggerKind; value: string }
  steps: DripStep[]
  stopOnReply: boolean
  stopOnBooking: boolean
  window: { start: string; end: string }
  skipWeekends: boolean
  stats: { enrolled: number; active: number; completed: number; replied: number; booked: number }
  createdAt: string
}

export const priceOf = (template: string) => {
  const t = DRIP_TEMPLATES.find((x) => x.name === template)
  return RATES.find((r) => r.kind === (t?.category ?? 'marketing'))?.price ?? 0
}

/** Worst-case cost if one contact receives every step. */
export const costPerContact = (d: Pick<Drip, 'steps'>) => Math.round(d.steps.reduce((s, x) => s + priceOf(x.template), 0) * 100) / 100

/** Total time from entering the drip to the last message, in minutes. */
export function totalDuration(steps: Pick<DripStep, 'delay' | 'unit'>[]): number {
  const mult: Record<DelayUnit, number> = { minutes: 1, hours: 60, days: 1440 }
  return steps.reduce((s, x) => s + x.delay * mult[x.unit], 0)
}

export const renderTemplate = (body: string, name: string) => body.replace(/\{\{name\}\}/g, name)

const step = (id: string, delay: number, unit: DelayUnit, template: string, condition: StepCondition, stats: DripStep['stats']): DripStep => ({ id, delay, unit, template, condition, stats })

function sampleDrips(): Drip[] {
  const at = new Date(Date.UTC(2026, 8, 15)).toISOString()
  const base = { stopOnReply: true, stopOnBooking: true, window: { start: '09:00', end: '20:00' }, skipWeekends: false, createdAt: at }
  return [
    {
      ...base,
      id: 'dr-nurture',
      name: 'New lead nurture',
      status: 'active',
      trigger: { kind: 'new_lead', value: 'warm' },
      steps: [
        step('s1', 10, 'minutes', 'new_lead_welcome', 'always', { sent: 412, read: 361, replied: 96 }),
        step('s2', 2, 'days', 'site_visit_invite', 'not_replied', { sent: 288, read: 230, replied: 41 }),
        step('s3', 3, 'days', 'limited_offer', 'not_booked', { sent: 206, read: 158, replied: 22 }),
        step('s4', 2, 'days', 'last_chance', 'not_booked', { sent: 171, read: 120, replied: 18 }),
      ],
      stats: { enrolled: 412, active: 58, completed: 296, replied: 177, booked: 64 },
    },
    {
      ...base,
      id: 'dr-winback',
      name: 'Win-back after 60 days',
      status: 'active',
      trigger: { kind: 'segment', value: 'sg-inactive' },
      skipWeekends: true,
      steps: [
        step('s1', 0, 'minutes', 'win_back_offer', 'always', { sent: 95, read: 71, replied: 12 }),
        step('s2', 5, 'days', 'last_chance', 'not_replied', { sent: 80, read: 52, replied: 6 }),
      ],
      stats: { enrolled: 95, active: 14, completed: 69, replied: 18, booked: 9 },
    },
    {
      ...base,
      id: 'dr-feedback',
      name: 'After-visit feedback',
      status: 'paused',
      trigger: { kind: 'after_booking', value: 'completed' },
      stopOnBooking: false,
      steps: [
        step('s1', 3, 'hours', 'visit_feedback', 'always', { sent: 130, read: 118, replied: 74 }),
        step('s2', 1, 'days', 'review_request', 'not_replied', { sent: 56, read: 41, replied: 9 }),
      ],
      stats: { enrolled: 130, active: 0, completed: 130, replied: 83, booked: 0 },
    },
  ]
}

export function newDrip(trigger: Drip['trigger'] = { kind: 'new_lead', value: 'hot' }): Drip {
  return {
    id: `dr-${Date.now()}`,
    name: '',
    status: 'draft',
    trigger,
    steps: [step('s1', 0, 'minutes', DRIP_TEMPLATES[0].name, 'always', { sent: 0, read: 0, replied: 0 })],
    stopOnReply: true,
    stopOnBooking: true,
    window: { start: '09:00', end: '20:00' },
    skipWeekends: false,
    stats: { enrolled: 0, active: 0, completed: 0, replied: 0, booked: 0 },
    createdAt: new Date().toISOString(),
  }
}

export const dripsStore = createStore<{ drips: Drip[] }>(() => ({ drips: sampleDrips() }), 'autoshift.drips')
const SERVER = { drips: sampleDrips() }
export const useDrips = () => useStore(dripsStore, SERVER).drips

export function updateDrip(id: string, patch: Partial<Drip>) {
  dripsStore.set((s) => ({ drips: s.drips.map((d) => (d.id === id ? { ...d, ...patch } : d)) }))
}
