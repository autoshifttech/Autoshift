import { describe, expect, it } from 'vitest'
import { defaultTools, newAssistant, simulateReply } from './model'

const tools = defaultTools()

describe('simulateReply', () => {
  it('does not use tools the assistant lacks or that are switched off', () => {
    const a = { ...newAssistant('support'), knowledge: [] }
    const off = tools.map((t) => (t.id === 'order_status' ? { ...t, enabled: false } : t))
    expect(simulateReply(a, off, 'Where is my order OT-1042?').toolCalls.some((c) => c.toolId === 'order_status')).toBe(false)
    expect(simulateReply(a, tools, 'Where is my order OT-1042?').toolCalls[0].toolId).toBe('order_status')
  })

  it('hands off on request and answers from knowledge', () => {
    const a = { ...newAssistant('sales'), knowledge: [{ q: 'Do you deliver outside Chennai?', a: 'Yes, all over India.' }] }
    expect(simulateReply(a, tools, 'Can I talk to someone?').handoff).toBe(true)
    expect(simulateReply(a, tools, 'do you deliver to Mumbai').text).toBe('Yes, all over India.')
  })

  it('captures lead details only when lead capture is on', () => {
    const on = newAssistant('sales')
    expect(simulateReply(on, tools, 'My budget is 80 lakh').toolCalls.map((c) => c.toolId)).toContain('capture_lead')
    expect(simulateReply({ ...on, captureLeads: false }, tools, 'My budget is 80 lakh').toolCalls.map((c) => c.toolId)).not.toContain('capture_lead')
  })
})
