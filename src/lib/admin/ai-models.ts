import { createStore, useStore } from '@/lib/workspace/store'
import { backendUrl } from '@/lib/backend/client'
import { CATALOG, VENDORS, type CatalogModel, type ModelTierKey, type VendorId } from '@/lib/ai/catalog'

/**
 * What the admin switches on for every business: which providers (each with
 * its own API key) and which of their models. The platform pays the provider
 * bill; businesses are charged per reply from their wallet. The browser keeps
 * only the last four characters of a key.
 */
export interface ProviderState {
  enabled: boolean
  /** Last four characters of the saved key; null until one is saved. */
  keyTail: string | null
  savedAt: string | null
}

export interface ModelState extends CatalogModel {
  enabled: boolean
  /** Added by hand rather than from the built-in list. */
  custom?: boolean
}

export interface AiModelsState {
  providers: Record<VendorId, ProviderState>
  models: Record<VendorId, ModelState[]>
  /** Used when a business hasn't picked a model. */
  defaultChoice: { vendor: VendorId; model: string }
}

function initialAiModels(): AiModelsState {
  // With a backend nothing is on until the server says so (an admin must save a key first).
  const live = backendUrl() !== null
  const providers = Object.fromEntries(
    VENDORS.map((v) => [v.id, { enabled: !live && (v.id === 'openai' || v.id === 'google' || v.id === 'anthropic'), keyTail: null, savedAt: null }]),
  ) as Record<VendorId, ProviderState>
  const models = Object.fromEntries(VENDORS.map((v) => [v.id, live ? [] : CATALOG[v.id].map((m) => ({ ...m, enabled: true }))])) as Record<VendorId, ModelState[]>
  return { providers, models, defaultChoice: { vendor: 'openai', model: 'gpt-5.4-mini' } }
}

export const aiModelsStore = createStore<AiModelsState>(initialAiModels, backendUrl() ? undefined : 'autoshift.admin.ai-models.v2')

const SERVER = initialAiModels()
export const useAiModels = () => useStore(aiModelsStore, SERVER)

/** Providers that are on and have at least one model on — what businesses can pick from. */
export function availableChoices(state: AiModelsState): { vendor: VendorId; models: ModelState[] }[] {
  return VENDORS.filter((v) => state.providers[v.id]?.enabled)
    .map((v) => ({ vendor: v.id, models: (state.models[v.id] ?? []).filter((m) => m.enabled) }))
    .filter((c) => c.models.length > 0)
}

export function tierOf(state: AiModelsState, vendor: VendorId, model: string): ModelTierKey {
  return state.models[vendor]?.find((m) => m.id === model)?.tier ?? 'balanced'
}
