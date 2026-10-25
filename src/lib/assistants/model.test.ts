import { describe, expect, it } from 'vitest'
import { defaultTools, newAssistant, simulateReply } from './model'

const tools = defaultTools()

describe('simulateReply', () => {
  it('offers slots, then books, using the booking tools', () => {
    const a = newAssistant('booking')
    const offer = simulateReply(a, tools, 'Can I book a haircut tomorrow?')
    expect(offer.toolCalls.map((c) => c.toolId)).toEqual(['check_availability'])
    const booked = simulateReply(a, tools, 'Yes 14:30 please')
    expect(booked.toolCalls[0].toolId).toBe('book_appointment')
    expect(booked.text).toContain('14:30')
    expect(simulateReply(a, tools, 'ok 11 am').text).toContain('11:00')
  })

  it('does not use tools the assistant lacks or that are switched off', () => {
    const a = { ...newAssistant('support'), knowledge: [] }
    expect(simulateReply(a, tools, 'Can I book a visit?').toolCalls.some((c) => c.toolId === 'check_availability')).toBe(false)
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
