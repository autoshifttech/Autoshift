/**
 * Lead capture: the questions the AI asks in WhatsApp, how answers turn
 * into a Hot / Warm / Cold score, when a lead is handed to a person, and
 * which pipeline stage it lands in. Plus per-industry AI presets.
 * Kept in the browser until the Supabase tables exist.
 */
import { createStore, useStore } from '@/lib/workspace/store'
import type { Industry } from '@/lib/workspace/setup'

export type AnswerType = 'text' | 'choice' | 'number'

export interface LeadQuestion {
  id: string
  /** Asked in the customer's chat, in your words. */
  prompt: string
  /** Where the answer is saved on the contact. */
  saveAs: string
  type: AnswerType
  options: string[]
  required: boolean
}

export type RuleOp = 'answered' | 'equals' | 'contains' | 'at_least'

export interface ScoreRule {
  id: string
  questionId: string
  op: RuleOp
  value: string
  points: number
}

export type LeadTemp = 'hot' | 'warm' | 'cold'

export interface Thresholds {
  hot: number
  warm: number
}

export interface HandoffSettings {
  onHot: boolean
  onHumanRequest: boolean
  keywords: string[]
  assignTo: 'round_robin' | 'owner' | 'least_busy'
  notifyInApp: boolean
  notifyEmail: boolean
  handoffMessage: string
}

export interface PipelineRouting {
  enabled: boolean
  pipeline: string
  stageHot: string
  stageWarm: string
  valueFromQuestionId: string | null
}

export interface AiProfile {
  tone: 'friendly' | 'professional' | 'concise'
  faqs: { q: string; a: string }[]
  fallback: string
}

export interface LeadSettings {
  enabled: boolean
  industry: Industry
  questions: LeadQuestion[]
  rules: ScoreRule[]
  thresholds: Thresholds
  handoff: HandoffSettings
  routing: PipelineRouting
  ai: AiProfile
}

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]
export const LEAD_SOURCES = ['whatsapp_ad', 'website', 'campaign', 'organic', 'referral'] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export interface LeadEvent {
  at: string
  kind: 'captured' | 'answered' | 'scored' | 'handoff' | 'status' | 'booked' | 'note'
  text: string
}

export interface Lead {
  id: string
  name: string
  phone: string
  answers: Record<string, string>
  capturedAt: string
  handedOffTo: string | null
  status: LeadStatus
  source: LeadSource
  /** Which AI assistant talked to them. */
  assistant: string
  events: LeadEvent[]
}

// --- scoring ----------------------------------------------------------------

const num = (v: string) => Number(String(v).replace(/[^\d.]/g, ''))

export function ruleMatches(rule: ScoreRule, answer: string | undefined): boolean {
  const a = (answer ?? '').trim()
  if (!a) return false
  switch (rule.op) {
    case 'answered':
      return true
    case 'equals':
      return a.toLowerCase() === rule.value.trim().toLowerCase()
    case 'contains':
      return rule.value
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
        .some((v) => a.toLowerCase().includes(v))
    case 'at_least':
      return Number.isFinite(num(a)) && num(a) >= num(rule.value)
  }
}

/** Which rules a lead matched, for the score breakdown. */
export function scoreBreakdown(answers: Record<string, string>, rules: ScoreRule[]): ScoreRule[] {
  return rules.filter((r) => ruleMatches(r, answers[r.questionId]))
}

export function scoreLead(answers: Record<string, string>, rules: ScoreRule[]): number {
  const total = rules.reduce((sum, r) => sum + (ruleMatches(r, answers[r.questionId]) ? r.points : 0), 0)
  return Math.max(0, Math.min(100, total))
}

export function temperature(score: number, t: Thresholds): LeadTemp {
  if (score >= t.hot) return 'hot'
  if (score >= t.warm) return 'warm'
  return 'cold'
}

/** Whether a customer message asks for a person or hits a hand-off keyword. */
export function wantsHuman(message: string, keywords: string[]): boolean {
  const m = message.toLowerCase()
  return keywords.some((k) => k.trim() && m.includes(k.trim().toLowerCase()))
}

// --- presets ----------------------------------------------------------------

const q = (id: string, prompt: string, saveAs: string, type: AnswerType = 'text', options: string[] = [], required = true): LeadQuestion => ({
  id,
  prompt,
  saveAs,
  type,
  options,
  required,
})
const r = (id: string, questionId: string, op: RuleOp, value: string, points: number): ScoreRule => ({ id, questionId, op, value, points })

interface Preset {
  questions: LeadQuestion[]
  rules: ScoreRule[]
  faqs: { q: string; a: string }[]
  valueFrom: string | null
}

/** English starter content per business type; the business edits it in their own words. */
export const PRESETS: Record<Industry, Preset> = {
  clinic: {
    questions: [
      q('name', 'May I have your name?', 'Name'),
      q('concern', 'What would you like to consult the doctor about?', 'Concern'),
      q('doctor', 'Do you have a preferred doctor?', 'Preferred doctor', 'choice', ['Any', 'Dr. Rao', 'Dr. Iyer'], false),
      q('when', 'When would you like to come in?', 'Preferred day', 'choice', ['Today', 'This week', 'Next week']),
    ],
    rules: [r('r1', 'name', 'answered', '', 10), r('r2', 'when', 'equals', 'Today', 50), r('r3', 'when', 'equals', 'This week', 35), r('r4', 'concern', 'answered', '', 20)],
    faqs: [
      { q: 'What are your timings?', a: 'Mon–Sat, 10am to 7pm. Sunday closed.' },
      { q: 'What is the consultation fee?', a: 'First consultation is ₹600; follow-ups within 7 days are free.' },
    ],
    valueFrom: null,
  },
  salon: {
    questions: [
      q('name', 'May I have your name?', 'Name'),
      q('service', 'Which service are you looking for?', 'Service', 'choice', ['Haircut', 'Hair colour', 'Facial', 'Bridal']),
      q('stylist', 'Any preferred stylist?', 'Preferred stylist', 'text', [], false),
      q('when', 'When would you like to visit?', 'Preferred day', 'choice', ['Today', 'This week', 'Just checking prices']),
    ],
    rules: [r('r1', 'name', 'answered', '', 10), r('r2', 'service', 'equals', 'Bridal', 40), r('r3', 'when', 'equals', 'Today', 40), r('r4', 'when', 'equals', 'This week', 25)],
    faqs: [
      { q: 'How much is a haircut?', a: 'Haircut & styling starts at ₹800.' },
      { q: 'Do you have offers?', a: '20% off colour services on weekdays this month.' },
    ],
    valueFrom: null,
  },
  real_estate: {
    questions: [
      q('name', 'May I have your name?', 'Name'),
      q('budget', 'What is your budget (in lakhs)?', 'Budget', 'number'),
      q('location', 'Which area are you looking in?', 'Location'),
      q('type', 'What type of property?', 'Property type', 'choice', ['Apartment', 'Villa', 'Plot', 'Commercial']),
      q('timeline', 'When are you planning to buy?', 'Timeline', 'choice', ['Within 1 month', '1–3 months', '3–6 months', 'Just exploring']),
    ],
    rules: [
      r('r1', 'name', 'answered', '', 5),
      r('r2', 'budget', 'at_least', '80', 30),
      r('r3', 'budget', 'at_least', '40', 15),
      r('r4', 'timeline', 'equals', 'Within 1 month', 40),
      r('r5', 'timeline', 'equals', '1–3 months', 25),
      r('r6', 'location', 'answered', '', 10),
    ],
    faqs: [
      { q: 'Where is the project?', a: 'Olive Heights is on OMR, 5 minutes from the IT corridor.' },
      { q: 'What are the prices?', a: '2 BHK from ₹68 lakh, 3 BHK from ₹95 lakh.' },
    ],
    valueFrom: 'budget',
  },
  retail: {
    questions: [
      q('name', 'May I have your name?', 'Name'),
      q('product', 'What are you looking for?', 'Interested in'),
      q('city', 'Which city should we deliver to?', 'City'),
      q('budget', 'Do you have a budget in mind?', 'Budget', 'number', [], false),
    ],
    rules: [r('r1', 'product', 'answered', '', 30), r('r2', 'city', 'answered', '', 20), r('r3', 'budget', 'at_least', '2000', 30), r('r4', 'name', 'answered', '', 10)],
    faqs: [
      { q: 'How long is delivery?', a: 'Orders ship in 24 hours and arrive in 2–4 days.' },
      { q: 'Can I return?', a: 'Yes, free returns within 7 days.' },
    ],
    valueFrom: 'budget',
  },
  education: {
    questions: [
      q('name', 'May I have the student’s name?', 'Name'),
      q('course', 'Which course are you interested in?', 'Course'),
      q('level', 'What is the current level or class?', 'Current level'),
      q('batch', 'Which batch suits you?', 'Preferred batch', 'choice', ['Weekday morning', 'Weekday evening', 'Weekend']),
    ],
    rules: [r('r1', 'name', 'answered', '', 10), r('r2', 'course', 'answered', '', 30), r('r3', 'batch', 'answered', '', 30), r('r4', 'level', 'answered', '', 10)],
    faqs: [
      { q: 'What are the fees?', a: 'Fees start at ₹4,500 a month. The first demo class is free.' },
      { q: 'Is there a demo class?', a: 'Yes! Book a free 45-minute demo class any weekday.' },
    ],
    valueFrom: null,
  },
  restaurant: {
    questions: [
      q('name', 'May I have your name?', 'Name'),
      q('party', 'How many people?', 'Party size', 'number'),
      q('occasion', 'Is it a special occasion?', 'Occasion', 'choice', ['No', 'Birthday', 'Anniversary', 'Corporate'], false),
      q('date', 'Which date and time?', 'Preferred date'),
    ],
    rules: [r('r1', 'party', 'at_least', '6', 40), r('r2', 'occasion', 'contains', 'Birthday, Anniversary, Corporate', 30), r('r3', 'date', 'answered', '', 20)],
    faqs: [
      { q: 'What are your timings?', a: 'Open daily, 12 noon to 11 pm.' },
      { q: 'Do you deliver?', a: 'Yes, within 5 km through our own delivery.' },
    ],
    valueFrom: null,
  },
  services: {
    questions: [
      q('name', 'May I have your name?', 'Name'),
      q('need', 'What do you need help with?', 'Service needed'),
      q('area', 'Which area are you in?', 'Area'),
      q('urgency', 'How soon do you need it?', 'Urgency', 'choice', ['Today', 'This week', 'Flexible']),
    ],
    rules: [r('r1', 'need', 'answered', '', 25), r('r2', 'area', 'answered', '', 15), r('r3', 'urgency', 'equals', 'Today', 50), r('r4', 'urgency', 'equals', 'This week', 30)],
    faqs: [
      { q: 'What are the visit charges?', a: 'Visit charge is ₹299, adjusted in the final bill.' },
      { q: 'Which areas do you cover?', a: 'All of Chennai city limits.' },
    ],
    valueFrom: null,
  },
  other: {
    questions: [
      q('name', 'May I have your name?', 'Name'),
      q('need', 'What are you looking for?', 'Need'),
      q('budget', 'Do you have a budget in mind?', 'Budget', 'number', [], false),
      q('timeline', 'When do you need it?', 'Timeline', 'choice', ['This week', 'This month', 'Later']),
    ],
    rules: [r('r1', 'need', 'answered', '', 30), r('r2', 'timeline', 'equals', 'This week', 40), r('r3', 'timeline', 'equals', 'This month', 20), r('r4', 'name', 'answered', '', 10)],
    faqs: [{ q: 'What are your hours?', a: 'Mon–Fri, 9am to 6pm.' }],
    valueFrom: 'budget',
  },
}

export function applyPreset(settings: LeadSettings, industry: Industry): LeadSettings {
  const p = PRESETS[industry]
  return {
    ...settings,
    industry,
    questions: structuredClone(p.questions),
    rules: structuredClone(p.rules),
    routing: { ...settings.routing, valueFromQuestionId: p.valueFrom },
    ai: { ...settings.ai, faqs: structuredClone(p.faqs) },
  }
}

// --- sample workspace -------------------------------------------------------

export const SAMPLE_PIPELINES: Record<string, string[]> = {
  Sales: ['New lead', 'Qualified', 'Proposal', 'Won'],
  'Site visits': ['Requested', 'Scheduled', 'Visited', 'Booked'],
}

export function defaultLeadSettings(): LeadSettings {
  return applyPreset(
    {
      enabled: true,
      industry: 'real_estate',
      questions: [],
      rules: [],
      thresholds: { hot: 60, warm: 30 },
      handoff: {
        onHot: true,
        onHumanRequest: true,
        keywords: ['call me', 'talk to someone', 'agent', 'human'],
        assignTo: 'round_robin',
        notifyInApp: true,
        notifyEmail: false,
        handoffMessage: 'Thanks! I’m connecting you with our team — someone will reply here shortly.',
      },
      routing: { enabled: true, pipeline: 'Sales', stageHot: 'Qualified', stageWarm: 'New lead', valueFromQuestionId: null },
      ai: { tone: 'friendly', faqs: [], fallback: 'Let me check that with the team and get back to you.' },
    },
    'real_estate',
  )
}

export function sampleLeads(now = Date.now()): Lead[] {
  const ago = (m: number) => new Date(now - m * 60_000).toISOString()
  type Row = [string, string, Record<string, string>, number, string | null, LeadStatus, LeadSource, string]
  const rows: Row[] = [
    ['Arjun Mehta', '+91 99620 11873', { name: 'Arjun', budget: '95', location: 'OMR', type: 'Apartment', timeline: 'Within 1 month' }, 18, 'Rahul Iyer', 'qualified', 'whatsapp_ad', 'Sales assistant'],
    ['Priya Raman', '+91 98765 43210', { name: 'Priya', budget: '60', location: 'Velachery', type: 'Apartment', timeline: '1–3 months' }, 64, null, 'contacted', 'website', 'Sales assistant'],
    ['Meena Iyer', '+91 94450 12345', { name: 'Meena', budget: '120', location: 'ECR', type: 'Villa', timeline: '1–3 months' }, 140, 'Asha Kumar', 'qualified', 'referral', 'Sales assistant'],
    ['Omar Hussain', '+91 97000 12345', { name: 'Omar', timeline: 'Just exploring' }, 60 * 26, null, 'new', 'organic', 'Sales assistant'],
    ['Sara Thomas', '+91 90031 55520', { name: 'Sara', budget: '45', location: 'Tambaram', timeline: '3–6 months' }, 60 * 30, null, 'contacted', 'campaign', 'Sales assistant'],
    ['Karthik Rao', '+91 98401 22334', { name: 'Karthik', budget: '85', location: 'Adyar', type: 'Apartment', timeline: 'Within 1 month' }, 60 * 5, 'Rahul Iyer', 'won', 'whatsapp_ad', 'Sales assistant'],
    ['Divya Menon', '+91 99401 55678', { name: 'Divya', budget: '70', location: 'Anna Nagar', type: 'Apartment', timeline: '1–3 months' }, 60 * 9, null, 'new', 'whatsapp_ad', 'Sales assistant'],
    ['Vikram Singh', '+91 98840 77889', { name: 'Vikram', budget: '150', location: 'ECR', type: 'Villa', timeline: 'Within 1 month' }, 60 * 3, 'Asha Kumar', 'qualified', 'referral', 'Sales assistant'],
    ['Lakshmi Pillai', '+91 94440 33445', { name: 'Lakshmi', budget: '35', location: 'Porur', timeline: '3–6 months' }, 60 * 50, null, 'lost', 'campaign', 'Sales assistant'],
    ['Nisha Kapoor', '+91 99887 76655', { name: 'Nisha', budget: '55', location: 'OMR', type: 'Plot', timeline: '1–3 months' }, 60 * 12, null, 'contacted', 'website', 'Support assistant'],
    ['Farhan Ali', '+91 97890 11223', { name: 'Farhan', type: 'Commercial', timeline: 'Just exploring' }, 60 * 72, null, 'new', 'organic', 'Sales assistant'],
    ['Rekha Das', '+91 98410 66778', { name: 'Rekha', budget: '90', location: 'Velachery', type: 'Apartment', timeline: 'Within 1 month' }, 60 * 1.5, null, 'new', 'whatsapp_ad', 'Sales assistant'],
  ]
  return rows.map(([name, phone, answers, m, handedOffTo, status, source, assistant], i) => {
    const events: LeadEvent[] = [
      { at: ago(m), kind: 'captured', text: source },
      { at: ago(m - 3), kind: 'answered', text: String(Object.keys(answers).length) },
    ]
    if (handedOffTo) events.push({ at: ago(m - 6), kind: 'handoff', text: handedOffTo })
    if (status === 'won') events.push({ at: ago(m - 600), kind: 'booked', text: 'Site visit' }, { at: ago(m - 2000), kind: 'status', text: 'won' })
    if (status === 'lost') events.push({ at: ago(m - 1500), kind: 'status', text: 'lost' })
    return { id: `l${i + 1}`, name, phone, answers, capturedAt: ago(m), handedOffTo, status, source, assistant, events }
  })
}

export const leadStore = createStore<LeadSettings>(defaultLeadSettings, 'autoshift.leads')
const SERVER_SETTINGS = defaultLeadSettings()
export const useLeadSettings = () => useStore(leadStore, SERVER_SETTINGS)

// v2: leads gained status, source, assistant and a timeline.
export const leadsStore = createStore<{ leads: Lead[] }>(() => ({ leads: sampleLeads() }), 'autoshift.leadlist.v2')
const SERVER_LEADS = { leads: sampleLeads(0) }
export const useLeads = () => useStore(leadsStore, SERVER_LEADS).leads

export const phoneKey = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').slice(-10)
