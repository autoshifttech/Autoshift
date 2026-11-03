import { createStore, useStore } from '@/lib/workspace/store'

/**
 * The AI models AutoShift offers to every business. The platform pays the
 * provider bill; businesses are charged per reply from their wallet. Keys are
 * entered here only — the browser keeps just the last four characters.
 */
export type AiVendor = 'openai' | 'google' | 'anthropic'

export interface AiModelEntry {
  vendor: AiVendor
  /** Name shown to the team, e.g. "ChatGPT". */
  label: string
  provider: string
  model: string
  enabled: boolean
  /** Last four characters of the saved key; null until one is saved. */
  keyTail: string | null
  savedAt: string | null
}

export interface AiModelsState {
  models: AiModelEntry[]
  /** The vendor used when a business hasn't chosen one. */
  defaultVendor: AiVendor
}

export const VENDOR_KEY_HINT: Record<AiVendor, string> = {
  openai: 'sk-...',
  google: 'AIza...',
  anthropic: 'sk-ant-...',
}

function initialAiModels(): AiModelsState {
  return {
    models: [
      { vendor: 'openai', label: 'ChatGPT', provider: 'OpenAI', model: 'gpt-5.4-mini', enabled: false, keyTail: null, savedAt: null },
      { vendor: 'google', label: 'Gemini', provider: 'Google', model: 'gemini-2.5-flash', enabled: false, keyTail: null, savedAt: null },
      { vendor: 'anthropic', label: 'Claude', provider: 'Anthropic', model: 'claude-haiku-5-5', enabled: false, keyTail: null, savedAt: null },
    ],
    defaultVendor: 'openai',
  }
}

export const aiModelsStore = createStore<AiModelsState>(initialAiModels, 'autoshift.admin.ai-models.v1')

const SERVER = initialAiModels()
export const useAiModels = () => useStore(aiModelsStore, SERVER)
