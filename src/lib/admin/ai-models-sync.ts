/**
 * AI providers and models from the AutoShift backend (only when NEXT_PUBLIC_API_URL is set).
 * Admins save provider keys and switch models on or off; the server encrypts the key, never sends it
 * back (only the last four characters), and records every change. Businesses see only what is on.
 */
import { backend, backendUrl } from '@/lib/backend/client'
import { toast } from '@/lib/toast'
import { VENDORS, type ModelTierKey, type VendorId } from '@/lib/ai/catalog'
import { aiModelsStore, type AiModelsState, type ModelState, type ProviderState } from './ai-models'

interface AdminResponse {
  providers: { vendor: VendorId; enabled: boolean; key_tail: string | null; saved_at: string | null }[]
  models: { vendor: VendorId; model_id: string; label: string; tier: ModelTierKey; enabled: boolean; is_custom: boolean; is_default: boolean }[]
}

interface AvailableRow {
  vendor: VendorId
  model_id: string
  label: string
  tier: ModelTierKey
  is_default: boolean
}

const blank = (): AiModelsState => ({
  providers: Object.fromEntries(VENDORS.map((v) => [v.id, { enabled: false, keyTail: null, savedAt: null }])) as Record<VendorId, ProviderState>,
  models: Object.fromEntries(VENDORS.map((v) => [v.id, []])) as unknown as Record<VendorId, ModelState[]>,
  defaultChoice: { vendor: 'openai', model: 'gpt-5.4-mini' },
})

export function fromAdmin(r: AdminResponse): AiModelsState {
  const s = blank()
  for (const p of r.providers) s.providers[p.vendor] = { enabled: p.enabled, keyTail: p.key_tail, savedAt: p.saved_at }
  for (const m of r.models) {
    s.models[m.vendor].push({ id: m.model_id, label: m.label, tier: m.tier, enabled: m.enabled, custom: m.is_custom || undefined })
    if (m.is_default) s.defaultChoice = { vendor: m.vendor, model: m.model_id }
  }
  return s
}

/** What a business can pick: only switched-on providers and models come back, so everything listed is on. */
export function fromAvailable(rows: AvailableRow[]): AiModelsState {
  const s = blank()
  for (const m of rows) {
    s.providers[m.vendor] = { enabled: true, keyTail: null, savedAt: null }
    s.models[m.vendor].push({ id: m.model_id, label: m.label, tier: m.tier, enabled: true })
    if (m.is_default) s.defaultChoice = { vendor: m.vendor, model: m.model_id }
  }
  return s
}

export async function loadAdminAiModels(): Promise<void> {
  aiModelsStore.set(fromAdmin(await backend<AdminResponse>('/v1/platform/ai-models')))
}

export async function loadAvailableAiModels(): Promise<void> {
  aiModelsStore.set(fromAvailable(await backend<AvailableRow[]>('/v1/ai-models/available')))
}

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'That did not work. Try again.')

async function run(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn()
    await loadAdminAiModels()
    return true
  } catch (e) {
    fail(e)
    await loadAdminAiModels().catch(() => {})
    return false
  }
}

const P = '/v1/platform/ai-providers'
export const saveProviderKey = (vendor: VendorId, apiKey: string) => run(() => backend(`${P}/${vendor}`, { method: 'PUT', body: { api_key: apiKey.trim() } }))
export const setProviderEnabled = (vendor: VendorId, enabled: boolean) => run(() => backend(`${P}/${vendor}`, { method: 'PUT', body: { enabled } }))
export const setModelEnabled = (vendor: VendorId, model: string, enabled: boolean) => run(() => backend(`${P}/${vendor}/models/${encodeURIComponent(model)}`, { method: 'PATCH', body: { enabled } }))
export const makeModelDefault = (vendor: VendorId, model: string) => run(() => backend(`${P}/${vendor}/models/${encodeURIComponent(model)}`, { method: 'PATCH', body: { is_default: true } }))
export const addModel = (vendor: VendorId, model: string) => run(() => backend(`${P}/${vendor}/models`, { method: 'POST', body: { model_id: model, label: model } }))

let started = false
/** Businesses: load what's on. Called from the app shell. */
export function startAvailableModelsSync() {
  if (!backendUrl() || started) return
  started = true
  loadAvailableAiModels().catch(() => {
    started = false
  })
}
