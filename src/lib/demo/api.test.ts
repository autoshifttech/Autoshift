import { describe, expect, it } from 'vitest'
import { handleAppApi } from './api'
import { createDemoData } from './data'

const call = (db: ReturnType<typeof createDemoData>, method: string, path: string, body?: unknown) =>
  handleAppApi(db, method, path, body === undefined ? null : JSON.stringify(body))

describe('demo app API', () => {
  it('creates, edits, duplicates and deletes automations with their steps', () => {
    const db = createDemoData()
    const steps = [{ step_type: 'send_message', step_config: { message: 'Hi' } }]
    const created = call(db, 'POST', '/api/automations', { name: 'Welcome', trigger_type: 'keyword', trigger_config: {}, is_active: true, steps })
    const id = (created.body as { automation: { id: string } }).automation.id
    expect(created.status).toBe(201)
    const loaded = call(db, 'GET', `/api/automations/${id}`).body as { automation: { name: string }; steps: { step_config: { message: string } }[] }
    expect(loaded.automation.name).toBe('Welcome')
    expect(loaded.steps[0].step_config.message).toBe('Hi')
    call(db, 'PATCH', `/api/automations/${id}`, { name: 'Renamed' })
    expect(db.automations.find((a) => a.id === id)?.name).toBe('Renamed')
    expect(call(db, 'POST', `/api/automations/${id}/duplicate`).status).toBe(201)
    call(db, 'DELETE', `/api/automations/${id}`)
    expect(db.automations.some((a) => a.id === id)).toBe(false)
  })

  it('remembers AI and WhatsApp settings without exposing keys', () => {
    const db = createDemoData()
    expect(call(db, 'GET', '/api/ai/config').body).toEqual({ configured: false })
    call(db, 'POST', '/api/ai/config', { provider: 'openai', model: 'gpt', api_key: 'secret' })
    const cfg = call(db, 'GET', '/api/ai/config').body as Record<string, unknown>
    expect(cfg.configured).toBe(true)
    expect(cfg.has_key).toBe(true)
    expect(cfg.api_key).toBeUndefined()
    call(db, 'POST', '/api/whatsapp/config', { phone_number_id: '1', access_token: 'x' })
    expect((call(db, 'GET', '/api/whatsapp/config').body as { connected: boolean }).connected).toBe(true)
  })

  it('creates invitations and API keys, and sends inbox messages', () => {
    const db = createDemoData()
    expect((call(db, 'POST', '/api/account/invitations', { role: 'agent' }).body as { expiresInDays: number }).expiresInDays).toBe(7)
    expect((call(db, 'POST', '/api/account/api-keys', { name: 'n8n' }).body as { plaintext: string }).plaintext).toMatch(/^autoshift_live_/)
    const conv = db.conversations[0]
    expect(call(db, 'POST', '/api/whatsapp/send', { conversation_id: conv.id, message_type: 'text', content_text: 'Hello' }).status).toBe(200)
    expect(conv.last_message_text).toBe('Hello')
  })

  it('answers the AI playground and accepts unknown writes', () => {
    const db = createDemoData()
    expect((call(db, 'POST', '/api/ai/playground', { message: 'what is the price?' }).body as { reply: string }).reply).toMatch(/₹/)
    expect(call(db, 'POST', '/api/something/else', {}).status).toBe(200)
    expect(call(db, 'GET', '/api/something/else').status).toBe(404)
  })
})
