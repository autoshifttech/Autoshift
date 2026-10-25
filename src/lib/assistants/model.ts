/**
 * AI assistants and the tools they can use in a WhatsApp chat. A business
 * can run several assistants (e.g. Sales and Support), each with its own
 * instructions, knowledge, tools, audience and hand-off rules. Sample data
 * kept in the browser until the backend exists.
 */
import { createStore, useStore } from '@/lib/workspace/store'

export const ASSISTANT_ROLES = ['sales', 'support', 'booking', 'custom'] as const
export type AssistantRole = (typeof ASSISTANT_ROLES)[number]
export type Tone = 'friendly' | 'professional' | 'concise'
export type Audience = 'all' | 'new_contacts' | 'tagged' | 'after_hours'
export type ModelTier = 'fast' | 'smart'

export interface Faq {
  q: string
  a: string
}

export interface Assistant {
  id: string
  name: string
  role: AssistantRole
  color: string
  enabled: boolean
  tone: Tone
  instructions: string
  greeting: string
  model: ModelTier
  knowledge: Faq[]
  toolIds: string[]
  captureLeads: boolean
  audience: Audience
  tags: string[]
  handoff: { onRequest: boolean; onUnknown: boolean; maxReplies: number }
  stats: { replies: number; handoffs: number; leads: number; bookings: number }
  createdAt: string
}

export const TOOL_CATEGORIES = ['booking', 'leads', 'messaging', 'team', 'custom'] as const
export type ToolCategory = (typeof TOOL_CATEGORIES)[number]

export interface ToolParam {
  name: string
  type: 'string' | 'number' | 'boolean'
  required: boolean
  description: string
}

export interface Tool {
  id: string
  /** Built-in tools have a fixed key; custom ones call a webhook. */
  builtin: boolean
  category: ToolCategory
  name: string
  /** Told to the AI: when to use this tool. */
  description: string
  enabled: boolean
  webhook?: { url: string; method: 'GET' | 'POST'; params: ToolParam[] }
  calls: number
}

export interface AssistantsState {
  assistants: Assistant[]
  tools: Tool[]
}

const builtin = (id: string, category: ToolCategory, name: string, description: string, calls: number): Tool => ({
  id,
  builtin: true,
  category,
  name,
  description,
  enabled: true,
  calls,
})

export function defaultTools(): Tool[] {
  return [
    builtin('check_availability', 'booking', 'Check free slots', 'Use when the customer asks when they can come in or wants to book. Returns free times for a service.', 412),
    builtin('book_appointment', 'booking', 'Book appointment', 'Use after the customer picks a time. Creates the booking and sends the WhatsApp confirmation.', 168),
    builtin('reschedule_appointment', 'booking', 'Reschedule appointment', 'Use when the customer wants to move an existing booking to another time.', 23),
    builtin('cancel_appointment', 'booking', 'Cancel appointment', 'Use when the customer asks to cancel their booking.', 9),
    builtin('capture_lead', 'leads', 'Save lead details', 'Use when the customer shares their name, budget, location or need. Saves the answers and updates the lead score.', 236),
    builtin('add_tag', 'leads', 'Add a tag', 'Use to label the contact, for example “Interested” or “VIP”.', 141),
    builtin('move_stage', 'leads', 'Move in pipeline', 'Use when a lead is qualified or ready to buy, to move their deal to the next stage.', 37),
    builtin('send_template', 'messaging', 'Send a template', 'Use to send an approved WhatsApp template, such as a price list or brochure.', 54),
    builtin('send_file', 'messaging', 'Send a file', 'Use to share a catalogue, menu or PDF from your Files library.', 61),
    builtin('handoff', 'team', 'Hand off to a person', 'Use when the customer asks for a person, is upset, or asks something you can’t answer.', 48),
    {
      id: 'order_status',
      builtin: false,
      category: 'custom',
      name: 'Check order status',
      description: 'Use when the customer asks where their order is. Needs the order number.',
      enabled: true,
      webhook: {
        url: 'https://n8n.example.com/webhook/order-status',
        method: 'POST',
        params: [{ name: 'order_id', type: 'string', required: true, description: 'Order number the customer gives, e.g. OT-1042' }],
      },
      calls: 77,
    },
  ]
}

export const ROLE_PRESETS: Record<AssistantRole, Pick<Assistant, 'name' | 'color' | 'tone' | 'instructions' | 'greeting' | 'toolIds' | 'captureLeads' | 'audience'>> = {
  sales: {
    name: 'Sales assistant',
    color: '#1E4C41',
    tone: 'friendly',
    instructions:
      'You help new customers find the right product and book a visit. Answer questions about products, prices and offers. Ask the lead questions naturally, one at a time. When a customer is ready to buy or book, offer free slots.',
    greeting: 'Hi! 👋 Welcome to Olive & Thread. What are you looking for today?',
    toolIds: ['check_availability', 'book_appointment', 'capture_lead', 'add_tag', 'move_stage', 'send_file', 'handoff'],
    captureLeads: true,
    audience: 'new_contacts',
  },
  support: {
    name: 'Support assistant',
    color: '#2563EB',
    tone: 'professional',
    instructions:
      'You help existing customers with orders, delivery, returns and bookings. Be clear and short. If you can’t solve it, apologise and hand the chat to the team.',
    greeting: 'Hello! How can I help with your order or booking today?',
    toolIds: ['order_status', 'reschedule_appointment', 'cancel_appointment', 'send_template', 'handoff'],
    captureLeads: false,
    audience: 'all',
  },
  booking: {
    name: 'Booking assistant',
    color: '#7C5CBF',
    tone: 'friendly',
    instructions: 'You book, move and cancel appointments. Always offer real free slots and confirm the service, date and time before booking.',
    greeting: 'Hi! Would you like to book an appointment? Tell me the service and I’ll show you free times.',
    toolIds: ['check_availability', 'book_appointment', 'reschedule_appointment', 'cancel_appointment', 'handoff'],
    captureLeads: false,
    audience: 'all',
  },
  custom: {
    name: 'New assistant',
    color: '#C2410C',
    tone: 'friendly',
    instructions: '',
    greeting: '',
    toolIds: ['handoff'],
    captureLeads: false,
    audience: 'all',
  },
}

export function newAssistant(role: AssistantRole, id = `as-${Date.now()}`): Assistant {
  return {
    id,
    role,
    enabled: role !== 'custom',
    model: 'fast',
    knowledge: [],
    tags: [],
    handoff: { onRequest: true, onUnknown: true, maxReplies: 15 },
    stats: { replies: 0, handoffs: 0, leads: 0, bookings: 0 },
    createdAt: new Date().toISOString(),
    ...structuredClone(ROLE_PRESETS[role]),
  }
}

function sampleState(): AssistantsState {
  const sales = {
    ...newAssistant('sales', 'as-sales'),
    knowledge: [
      { q: 'What are your prices?', a: 'Linen shirts start at ₹1,499 and kurtas at ₹1,899. Bridal orders are quoted after a consultation.' },
      { q: 'Do you deliver?', a: 'Yes, across India. Orders ship within 24 hours and arrive in 2–4 days.' },
      { q: 'Where is the store?', a: '12 Cathedral Road, Chennai. Open Monday to Saturday, 10am to 8pm.' },
    ],
    stats: { replies: 1156, handoffs: 38, leads: 64, bookings: 41 },
  }
  const support = {
    ...newAssistant('support', 'as-support'),
    knowledge: [
      { q: 'How do I return an item?', a: 'Reply RETURN with your order number within 7 days. We’ll arrange a free pickup.' },
      { q: 'When will I get my refund?', a: 'Refunds reach your account 3–5 working days after we receive the item.' },
    ],
    stats: { replies: 768, handoffs: 52, leads: 0, bookings: 6 },
  }
  const booking = { ...newAssistant('booking', 'as-booking'), enabled: false, stats: { replies: 0, handoffs: 0, leads: 0, bookings: 0 } }
  return { assistants: [sales, support, booking], tools: defaultTools() }
}

export const assistantsStore = createStore<AssistantsState>(sampleState, 'autoshift.assistants')
const SERVER_STATE = sampleState()
export const useAssistants = () => useStore(assistantsStore, SERVER_STATE)

export function updateAssistant(id: string, patch: Partial<Assistant>) {
  assistantsStore.set((s) => ({ ...s, assistants: s.assistants.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
}

export function updateTool(id: string, patch: Partial<Tool>) {
  assistantsStore.set((s) => ({ ...s, tools: s.tools.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
}

// --- simulated test chat ------------------------------------------------------

export interface ToolCall {
  toolId: string
  input: string
  output: string
}

export interface SimulatedReply {
  text: string
  toolCalls: ToolCall[]
  handoff: boolean
}

const has = (a: Assistant, toolId: string, tools: Tool[]) => a.toolIds.includes(toolId) && tools.some((t) => t.id === toolId && t.enabled)

/**
 * A rule-based stand-in for the real model so the test chat shows how an
 * assistant uses its knowledge and tools. Not an AI: keyword matching only.
 */
export function simulateReply(a: Assistant, tools: Tool[], message: string): SimulatedReply {
  const m = message.toLowerCase()
  const calls: ToolCall[] = []
  const reply = (text: string, handoff = false): SimulatedReply => ({ text, toolCalls: calls, handoff })

  if (/\b(human|person|agent|call me|talk to someone)\b/.test(m) && a.handoff.onRequest) {
    if (has(a, 'handoff', tools)) calls.push({ toolId: 'handoff', input: 'reason: customer asked for a person', output: 'assigned to Rahul Iyer' })
    return reply('Sure — I’m connecting you with our team now. Someone will reply here shortly.', true)
  }

  // A time like "14:30", "2.30" or "11 am" — not any number (budgets, order ids).
  const clock = m.match(/\b(\d{1,2})[:.](\d{2})\b/) ?? m.match(/\b(\d{1,2})\s*(am|pm)\b/)
  const slot = clock
    ? { hour: clock[2] === 'pm' && +clock[1] < 12 ? String(+clock[1] + 12) : clock[1], minute: /^\d{2}$/.test(clock[2] ?? '') ? clock[2] : '00' }
    : null
  if (/\b(book|appointment|slot|visit|come in|available)\b/.test(m) && !slot) {
    if (has(a, 'check_availability', tools)) {
      calls.push({ toolId: 'check_availability', input: 'service: Haircut & styling, date: tomorrow', output: '11:00, 14:30, 16:00' })
      return reply('I can book you in tomorrow at 11:00, 14:30 or 16:00. Which time works for you?')
    }
  }
  if (slot && has(a, 'book_appointment', tools)) {
    const time = `${slot.hour.padStart(2, '0')}:${slot.minute}`
    calls.push({ toolId: 'book_appointment', input: `service: Haircut & styling, time: tomorrow ${time}`, output: 'booking confirmed · confirmation sent' })
    return reply(`Done! ✅ You’re booked for tomorrow at ${time}. I’ve sent the confirmation here on WhatsApp.`)
  }
  if (/\b(cancel)\b/.test(m) && has(a, 'cancel_appointment', tools)) {
    calls.push({ toolId: 'cancel_appointment', input: 'booking: next upcoming', output: 'cancelled' })
    return reply('Your booking is cancelled. Would you like to pick another time?')
  }
  if (/\b(order|delivery|where is my|track)\b/.test(m) && has(a, 'order_status', tools)) {
    const id = message.match(/[A-Z]{2}-?\d{3,}/i)?.[0]
    if (!id) return reply('I can check that for you. What is your order number? It looks like OT-1042.')
    calls.push({ toolId: 'order_status', input: `order_id: ${id.toUpperCase()}`, output: '{ "status": "shipped", "eta": "Thursday" }' })
    return reply(`Your order ${id.toUpperCase()} has shipped and should arrive on Thursday. 📦`)
  }
  if (/\b(budget|lakh|₹|rs|looking for|interested)\b/.test(m) && a.captureLeads && has(a, 'capture_lead', tools)) {
    calls.push({ toolId: 'capture_lead', input: `answer: “${message.slice(0, 60)}”`, output: 'lead score 55 → Warm' })
    if (has(a, 'add_tag', tools)) calls.push({ toolId: 'add_tag', input: 'tag: Interested', output: 'added' })
    return reply('Thanks! That helps. Which area or city are you in, so I can suggest the best option?')
  }
  if (/\b(catalog|catalogue|brochure|menu|pdf)\b/.test(m) && has(a, 'send_file', tools)) {
    calls.push({ toolId: 'send_file', input: 'file: Festive catalogue.pdf', output: 'sent' })
    return reply('Here’s our latest catalogue 📎 Let me know if anything catches your eye!')
  }

  // Knowledge: the FAQ whose question shares the most words with the message.
  const words = new Set(m.split(/\W+/).filter((w) => w.length > 3))
  let best: Faq | null = null
  let bestScore = 0
  for (const f of a.knowledge) {
    const score = f.q.toLowerCase().split(/\W+/).filter((w) => words.has(w)).length
    if (score > bestScore) {
      best = f
      bestScore = score
    }
  }
  if (best) return reply(best.a)

  if (a.handoff.onUnknown && message.trim().length > 25) {
    if (has(a, 'handoff', tools)) calls.push({ toolId: 'handoff', input: 'reason: question not in knowledge', output: 'assigned to the team' })
    return reply('Good question — let me check with the team and get back to you here shortly.', true)
  }
  return reply(a.greeting || 'Hi! How can I help you today?')
}
