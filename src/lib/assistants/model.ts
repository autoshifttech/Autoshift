/**
 * AI assistants and the tools they can use in a WhatsApp chat. A business
 * can run several assistants (e.g. Sales and Support), each with its own
 * instructions, knowledge, tools, audience and hand-off rules. Loaded from
 * and saved to the backend (see backend-sync).
 */
import { createStore, useStore } from '@/lib/workspace/store'

export const ASSISTANT_ROLES = ['sales', 'support', 'custom'] as const
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
  /** The provider and model chosen from what the admin has switched on. */
  provider?: import('@/lib/ai/catalog').VendorId
  modelId?: string
  knowledge: Faq[]
  toolIds: string[]
  captureLeads: boolean
  audience: Audience
  tags: string[]
  handoff: { onRequest: boolean; onUnknown: boolean; maxReplies: number }
  stats: { replies: number; handoffs: number; leads: number }
  createdAt: string
}

export const TOOL_CATEGORIES = ['leads', 'messaging', 'team', 'custom'] as const
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
    builtin('capture_lead', 'leads', 'Save lead details', 'Use when the customer shares their name, budget, location or need. Saves the answers and updates the lead score.', 0),
    builtin('add_tag', 'leads', 'Add a tag', 'Use to label the contact, for example “Interested” or “VIP”.', 0),
    builtin('send_template', 'messaging', 'Send a template', 'Use to send an approved WhatsApp template, such as a price list or brochure.', 0),
    builtin('send_file', 'messaging', 'Send a file', 'Use to share a catalogue, menu or PDF from your Files library.', 0),
    builtin('handoff', 'team', 'Hand off to a person', 'Use when the customer asks for a person, is upset, or asks something you can’t answer.', 0),
  ]
}

export const ROLE_PRESETS: Record<AssistantRole, Pick<Assistant, 'name' | 'color' | 'tone' | 'instructions' | 'greeting' | 'toolIds' | 'captureLeads' | 'audience'>> = {
  sales: {
    name: 'Sales assistant',
    color: '#1E4C41',
    tone: 'friendly',
    instructions:
      'You help new customers find the right product. Answer questions about products, prices and offers. Ask the lead questions naturally, one at a time. When a customer is ready to buy, hand over to the team.',
    greeting: 'Hi! 👋 Thanks for messaging us. What are you looking for today?',
    toolIds: ['capture_lead', 'add_tag', 'send_file', 'handoff'],
    captureLeads: true,
    audience: 'new_contacts',
  },
  support: {
    name: 'Support assistant',
    color: '#2563EB',
    tone: 'professional',
    instructions:
      'You help existing customers with orders, delivery and returns. Be clear and short. If you can’t solve it, apologise and hand the chat to the team.',
    greeting: 'Hello! How can I help with your order today?',
    toolIds: ['send_template', 'handoff'],
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
    provider: 'openai',
    modelId: 'gpt-5.4-mini',
    knowledge: [],
    tags: [],
    handoff: { onRequest: true, onUnknown: true, maxReplies: 15 },
    stats: { replies: 0, handoffs: 0, leads: 0 },
    createdAt: new Date().toISOString(),
    ...structuredClone(ROLE_PRESETS[role]),
  }
}

function emptyState(): AssistantsState {
  return { assistants: [], tools: defaultTools() }
}

// v2: older browsers may still hold the sample assistants and tools under the old key.
export const assistantsStore = createStore<AssistantsState>(emptyState, 'autoshift.assistants.v2')
const SERVER_STATE = emptyState()
export const useAssistants = () => useStore(assistantsStore, SERVER_STATE)

/** When the backend gives a new assistant its real id, the id used until then keeps working. */
const idAliases = new Map<string, string>()
export function registerAssistantAlias(localId: string, realId: string) {
  idAliases.set(localId, realId)
}
export function resolveAssistantId(id: string): string {
  let out = id
  for (let hops = 0; idAliases.has(out) && hops < 5; hops++) out = idAliases.get(out)!
  return out
}

export function updateAssistant(id: string, patch: Partial<Assistant>) {
  const target = resolveAssistantId(id)
  assistantsStore.set((s) => ({ ...s, assistants: s.assistants.map((a) => (a.id === target ? { ...a, ...patch } : a)) }))
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
    if (has(a, 'handoff', tools)) calls.push({ toolId: 'handoff', input: 'reason: customer asked for a person', output: 'assigned to your team' })
    return reply('Sure — I’m connecting you with our team now. Someone will reply here shortly.', true)
  }

  if (/\b(budget|lakh|₹|rs|looking for|interested)\b/.test(m) && a.captureLeads && has(a, 'capture_lead', tools)) {
    calls.push({ toolId: 'capture_lead', input: `answer: “${message.slice(0, 60)}”`, output: 'lead score 55 → Warm' })
    if (has(a, 'add_tag', tools)) calls.push({ toolId: 'add_tag', input: 'tag: Interested', output: 'added' })
    return reply('Thanks! That helps. Which area or city are you in, so I can suggest the best option?')
  }
  if (/\b(catalog|catalogue|brochure|menu|pdf)\b/.test(m) && has(a, 'send_file', tools)) {
    calls.push({ toolId: 'send_file', input: 'file: from your Files library', output: 'sent' })
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
