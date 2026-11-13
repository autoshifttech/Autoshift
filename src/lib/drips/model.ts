/**
 * Drip campaigns: a sequence of WhatsApp template messages sent over time
 * to people who enter a trigger (a segment, a tag, a new lead).
 * Each step waits, checks a condition and sends a template. Drips are kept
 * in this browser until the scheduler exists on the backend (nothing sends them yet).
 */
import { useEffect } from 'react'
import { createStore, useStore } from '@/lib/workspace/store'
import { createClient } from '@/lib/supabase/client'
import { isLive } from '@/lib/workspace/live'
import { RATES } from '@/lib/wallet/model'

export const TRIGGERS = ['segment', 'new_lead', 'tag_added', 'manual'] as const
export type TriggerKind = (typeof TRIGGERS)[number]
export const CONDITIONS = ['always', 'not_replied', 'not_read'] as const
export type StepCondition = (typeof CONDITIONS)[number]
export type DelayUnit = 'minutes' | 'hours' | 'days'
export type DripStatus = 'active' | 'paused' | 'draft'

export interface DripTemplate {
  name: string
  category: 'marketing' | 'utility'
  body: string
  buttons: string[]
}


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
  window: { start: string; end: string }
  skipWeekends: boolean
  stats: { enrolled: number; active: number; completed: number; replied: number }
  createdAt: string
}

// Drips pick from the account's own approved WhatsApp templates.
export const dripTemplatesStore = createStore<{ templates: DripTemplate[]; loaded: boolean }>(() => ({ templates: [], loaded: false }))
let templatesLoad: Promise<void> | null = null
const EMPTY_TEMPLATES = { templates: [] as DripTemplate[], loaded: false }

export function useDripTemplates(): DripTemplate[] {
  useEffect(() => {
    if (!isLive() || templatesLoad) return
    templatesLoad = (async () => {
      const { data, error } = await createClient().from('message_templates').select('name, category, body_text, buttons').eq('status', 'APPROVED').order('name')
      if (error) throw error
      const templates = (data ?? []).map((t) => ({
        name: t.name as string,
        category: (String(t.category).toLowerCase() === 'marketing' ? 'marketing' : 'utility') as DripTemplate['category'],
        body: (t.body_text as string) ?? '',
        buttons: Array.isArray(t.buttons) ? (t.buttons as { text?: string }[]).map((b) => b.text ?? '').filter(Boolean) : [],
      }))
      dripTemplatesStore.set({ templates, loaded: true })
    })().catch((err) => {
      console.error('[drips] templates load failed', err)
      templatesLoad = null
    })
  }, [])
  return useStore(dripTemplatesStore, EMPTY_TEMPLATES).templates
}

export const priceOf = (template: string) => {
  const t = dripTemplatesStore.get().templates.find((x) => x.name === template)
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


export function newDrip(trigger: Drip['trigger'] = { kind: 'new_lead', value: 'hot' }): Drip {
  return {
    id: `dr-${Date.now()}`,
    name: '',
    status: 'draft',
    trigger,
    steps: [step('s1', 0, 'minutes', dripTemplatesStore.get().templates[0]?.name ?? '', 'always', { sent: 0, read: 0, replied: 0 })],
    stopOnReply: true,
    window: { start: '09:00', end: '20:00' },
    skipWeekends: false,
    stats: { enrolled: 0, active: 0, completed: 0, replied: 0 },
    createdAt: new Date().toISOString(),
  }
}

// Real accounts start with no drips (kept in this browser; nothing sends them yet).
export const dripsStore = createStore<{ drips: Drip[] }>(() => ({ drips: [] }), 'autoshift.drips.live')
const SERVER = { drips: [] as Drip[] }
export const useDrips = () => useStore(dripsStore, SERVER).drips

export function updateDrip(id: string, patch: Partial<Drip>) {
  dripsStore.set((s) => ({ drips: s.drips.map((d) => (d.id === id ? { ...d, ...patch } : d)) }))
}
