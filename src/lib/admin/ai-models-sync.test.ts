import { describe, expect, it } from 'vitest'
import { fromAdmin, fromAvailable } from './ai-models-sync'

describe('AI models mapping', () => {
  it('admin view keeps what is off, the key tail and the single default', () => {
    const s = fromAdmin({
      providers: [{ vendor: 'openai', enabled: true, key_tail: '9876', saved_at: '2026-11-04T00:00:00Z' }],
      models: [
        { vendor: 'openai', model_id: 'gpt-5.5', label: 'GPT-5.5', tier: 'flagship', enabled: true, is_custom: false, is_default: true },
        { vendor: 'openai', model_id: 'gpt-4.1', label: 'GPT-4.1', tier: 'balanced', enabled: false, is_custom: false, is_default: false },
        { vendor: 'openai', model_id: 'mine', label: 'mine', tier: 'balanced', enabled: true, is_custom: true, is_default: false },
      ],
    })
    expect(s.providers.openai).toEqual({ enabled: true, keyTail: '9876', savedAt: '2026-11-04T00:00:00Z' })
    expect(s.providers.google.enabled).toBe(false)
    expect(s.models.openai.map((m) => [m.id, m.enabled, m.custom])).toEqual([['gpt-5.5', true, undefined], ['gpt-4.1', false, undefined], ['mine', true, true]])
    expect(s.defaultChoice).toEqual({ vendor: 'openai', model: 'gpt-5.5' })
  })
  it('a business sees only providers and models that are on, and never a key', () => {
    const s = fromAvailable([{ vendor: 'anthropic', model_id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', tier: 'balanced', is_default: false }])
    expect(s.providers.anthropic.enabled).toBe(true)
    expect(s.providers.openai.enabled).toBe(false)
    expect(s.providers.anthropic.keyTail).toBeNull()
    expect(s.models.openai).toEqual([])
  })
})
