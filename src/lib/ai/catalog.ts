/**
 * The AI providers and models AutoShift can offer. The admin panel decides
 * which are switched on (and holds the API keys); businesses pick from what
 * is on. A model's `tier` picks the one-line tip shown under the list.
 */
export type VendorId = 'openai' | 'google' | 'anthropic' | 'deepseek' | 'deepinfra'

export type ModelTierKey = 'newest' | 'flagship' | 'balanced' | 'fast' | 'reasoning' | 'preview' | 'value'

export interface CatalogModel {
  id: string
  label: string
  tier: ModelTierKey
}

export interface Vendor {
  id: VendorId
  label: string
  keyHint: string
}

export const VENDORS: Vendor[] = [
  { id: 'openai', label: 'OpenAI', keyHint: 'sk-...' },
  { id: 'google', label: 'Gemini', keyHint: 'AIza...' },
  { id: 'anthropic', label: 'Anthropic', keyHint: 'sk-ant-...' },
  { id: 'deepseek', label: 'Deepseek', keyHint: 'sk-...' },
  { id: 'deepinfra', label: 'DeepInfra', keyHint: 'Bearer token' },
]

export const CATALOG: Record<VendorId, CatalogModel[]> = {
  openai: [
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', tier: 'newest' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna', tier: 'flagship' },
    { id: 'gpt-5.5', label: 'GPT-5.5', tier: 'flagship' },
    { id: 'gpt-5.4', label: 'GPT-5.4', tier: 'balanced' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', tier: 'fast' },
    { id: 'gpt-5.2', label: 'GPT-5.2', tier: 'balanced' },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini', tier: 'fast' },
    { id: 'gpt-4.1', label: 'GPT-4.1', tier: 'balanced' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', tier: 'fast' },
    { id: 'gpt-4o', label: 'GPT-4o', tier: 'balanced' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', tier: 'value' },
  ],
  google: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', tier: 'newest' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', tier: 'balanced' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', tier: 'fast' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', tier: 'value' },
    { id: 'gemini-3.1-pro-preview', label: 'Pro 3.1 Preview', tier: 'preview' },
    { id: 'gemini-3.1-flash-lite', label: 'Flash 3.1 Lite', tier: 'value' },
    { id: 'gemini-3-flash-preview', label: 'Flash 3 Preview', tier: 'preview' },
  ],
  anthropic: [
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', tier: 'balanced' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', tier: 'flagship' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'fast' },
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek Chat', tier: 'value' },
    { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', tier: 'reasoning' },
  ],
  deepinfra: [
    { id: 'llama-3.3-70b', label: 'Llama 3.3 70B', tier: 'value' },
    { id: 'qwen-2.5-72b', label: 'Qwen 2.5 72B', tier: 'balanced' },
  ],
}

export function vendorLabel(id: VendorId): string {
  return VENDORS.find((v) => v.id === id)?.label ?? id
}
