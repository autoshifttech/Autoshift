/**
 * Sample workspace for demo mode: "Olive & Thread", a small clothing store.
 * Everything here is illustrative and lives only in the browser tab.
 */
import type { DemoDb, Row } from './rest'

export const DEMO_USER_ID = 'de300000-0000-4000-8000-000000000001'
export const DEMO_AGENT_ID = 'de300000-0000-4000-8000-000000000002'
export const DEMO_ACCOUNT_ID = 'de300000-0000-4000-8000-0000000000a1'
export const DEMO_EMAIL = 'demo@autoshift.app'

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const daysAgo = (d: number) => minutesAgo(d * 24 * 60)

const id = (prefix: string, n: number) => `de300000-0000-4000-8000-${prefix}${String(n).padStart(12 - prefix.length, '0')}`

const base = (createdMinutesAgo: number): Row => ({
  user_id: DEMO_USER_ID,
  account_id: DEMO_ACCOUNT_ID,
  created_at: minutesAgo(createdMinutesAgo),
  updated_at: minutesAgo(Math.max(0, createdMinutesAgo - 30)),
})

const CONTACTS: [string, string, string | null, string | null][] = [
  ['Priya Raman', '+919876543210', 'priya@example.com', 'Raman Boutique'],
  ['Arjun Mehta', '+919962011873', null, 'Mehta Realty'],
  ['Sara Thomas', '+919003155520', 'sara.t@example.com', null],
  ['Leo Fernandes', '+919840072211', null, null],
  ['Meena Iyer', '+919445012345', 'meena@example.com', 'Iyer Clinic'],
  ['Omar Hussain', '+919700012345', null, null],
  ['Kavya Nair', '+919884455667', 'kavya@example.com', 'Nair Studio'],
  ['Rahul Verma', '+919811223344', null, 'Verma Traders'],
]

const TAGS: [string, string][] = [
  ['Interested', '#f59e0b'],
  ['Converted', '#10b981'],
  ['Cold', '#64748b'],
  ['VIP', '#8b5cf6'],
]

// contact index → tag indexes
const CONTACT_TAGS: Record<number, number[]> = { 0: [1, 3], 1: [0], 2: [0], 3: [1], 4: [0, 3], 5: [2], 6: [1], 7: [2] }

// [contact index, status, minutes since last message, unread, assigned?, messages]
const CONVERSATIONS: [number, 'open' | 'pending' | 'closed', number, number, boolean, [string, string][]][] = [
  [0, 'open', 4, 2, false, [
    ['customer', 'Hi! Do you have the linen shirt in olive, size M?'],
    ['bot', 'Yes — olive in M is in stock 🙌 It’s ₹1,499 and ships tomorrow. Want the link?'],
    ['customer', 'Yes please! Can it reach Coimbatore by Friday?'],
  ]],
  [1, 'open', 18, 1, true, [
    ['customer', 'Can I book a site visit on Saturday at 11?'],
    ['agent', 'Saturday 11:00 works. I’ll send the location pin shortly.'],
    ['customer', 'Great, thanks!'],
  ]],
  [2, 'pending', 32, 0, false, [
    ['customer', 'What are the batch timings for the weekend workshop?'],
    ['bot', 'Saturday and Sunday, 10am–1pm. Would you like to reserve a seat?'],
  ]],
  [3, 'open', 55, 0, true, [
    ['customer', 'Payment done ✅'],
    ['agent', 'Received, thank you Leo! Your order ships today.'],
  ]],
  [4, 'open', 140, 0, false, [
    ['customer', 'Do you do bulk orders for our clinic staff uniforms?'],
    ['bot', 'We do! For 20+ pieces you get 15% off. How many do you need?'],
    ['customer', 'Around 35, mixed sizes.'],
  ]],
  [5, 'closed', 60 * 30, 0, false, [
    ['customer', 'Not interested right now, thanks.'],
    ['agent', 'No problem, Omar. We’re here whenever you need us.'],
  ]],
]

export function createDemoData(): DemoDb {
  const contacts = CONTACTS.map(([name, phone, email, company], i) => ({
    ...base(60 * 24 * (20 - i)),
    id: id('c', i + 1),
    name,
    phone,
    phone_normalized: phone.replace(/\D/g, ''),
    email,
    company,
    avatar_url: null,
  }))
  const tags = TAGS.map(([name, color], i) => ({ ...base(60 * 24 * 30), id: id('t', i + 1), name, color }))
  const contactTags = Object.entries(CONTACT_TAGS).flatMap(([c, ts]) =>
    ts.map((t) => ({ id: id('ct', Number(c) * 10 + t + 1), contact_id: contacts[Number(c)].id, tag_id: tags[t].id, created_at: daysAgo(5) })),
  )

  const conversations: Row[] = []
  const messages: Row[] = []
  CONVERSATIONS.forEach(([c, status, lastMin, unread, assigned, lines], i) => {
    const convId = id('cv', i + 1)
    const last = lines[lines.length - 1]
    const lastInbound = [...lines].reverse().findIndex(([who]) => who === 'customer')
    conversations.push({
      ...base(lastMin + 60 * 24),
      id: convId,
      contact_id: contacts[c].id,
      status,
      assigned_agent_id: assigned ? DEMO_AGENT_ID : null,
      last_message_text: last[1],
      last_message_at: minutesAgo(lastMin),
      last_inbound_at: minutesAgo(lastMin + Math.max(0, lastInbound) * 2),
      last_reply_at: minutesAgo(lastMin + 1),
      unread_count: unread,
      closed_at: status === 'closed' ? minutesAgo(lastMin) : null,
      ai_autoreply_disabled: false,
      ai_reply_count: lines.filter(([who]) => who === 'bot').length,
      ai_handoff_summary: null,
    })
    lines.forEach(([who, text], j) => {
      messages.push({
        id: id('m', (i + 1) * 100 + j),
        conversation_id: convId,
        account_id: DEMO_ACCOUNT_ID,
        sender_type: who,
        sender_id: who === 'agent' ? DEMO_AGENT_ID : null,
        content_type: 'text',
        content_text: text,
        status: who === 'customer' ? 'read' : 'read',
        ai_generated: who === 'bot',
        message_id: `wamid.demo${i}${j}`,
        created_at: minutesAgo(lastMin + (lines.length - 1 - j) * 2),
      })
    })
  })

  const pipelineId = id('p', 1)
  const stages = [
    ['New lead', '#3b82f6'],
    ['Qualified', '#f59e0b'],
    ['Proposal', '#8b5cf6'],
    ['Won', '#10b981'],
  ].map(([name, color], i) => ({ id: id('ps', i + 1), pipeline_id: pipelineId, name, color, position: i, created_at: daysAgo(30), account_id: DEMO_ACCOUNT_ID }))
  const deals = [
    ['Bulk uniforms — Iyer Clinic', 4, 1, 52500],
    ['Site visit — Mehta Realty', 1, 0, 0],
    ['Wedding order — Raman Boutique', 0, 3, 38000],
    ['Weekend workshop seats', 2, 1, 6000],
    ['Corporate gifting — Verma Traders', 7, 2, 74000],
    ['Studio collab — Nair Studio', 6, 3, 21000],
  ].map(([title, c, s, value], i) => ({
    ...base(60 * 24 * (10 - i)),
    id: id('d', i + 1),
    pipeline_id: pipelineId,
    stage_id: stages[s as number].id,
    contact_id: contacts[c as number].id,
    title,
    value,
    currency: 'INR',
    status: (s as number) === 3 ? 'won' : 'open',
    assigned_to: DEMO_USER_ID,
  }))

  const templates = [
    ['festive_offer', 'Marketing', 'Hi {{1}}! Our festive sale is live — 20% off everything this week. Reply SHOP to see the catalogue.', 'APPROVED'],
    ['order_update', 'Utility', 'Hi {{1}}, your order {{2}} has shipped and will arrive by {{3}}.', 'APPROVED'],
    ['appointment_reminder', 'Utility', 'Reminder: your appointment is on {{1}} at {{2}}. Reply 1 to confirm or 2 to reschedule.', 'PENDING'],
  ].map(([name, category, body_text, status], i) => ({
    ...base(60 * 24 * (40 - i)),
    id: id('tp', i + 1),
    name,
    category,
    language: 'en_US',
    body_text,
    status,
    quality_score: status === 'APPROVED' ? 'GREEN' : null,
    buttons: [],
  }))

  const broadcasts = [
    { name: 'Festive sale', template_name: 'festive_offer', status: 'sent', total: 1900, sent: 1900, delivered: 1830, read: 1262, replied: 214, failed: 70, ago: 60 * 48 },
    { name: 'Restock alert — linen', template_name: 'festive_offer', status: 'sent', total: 640, sent: 640, delivered: 621, read: 433, replied: 58, failed: 19, ago: 60 * 24 * 6 },
  ].map((b, i) => ({
    ...base(b.ago),
    id: id('b', i + 1),
    name: b.name,
    template_name: b.template_name,
    template_language: 'en_US',
    status: b.status,
    total_recipients: b.total,
    sent_count: b.sent,
    delivered_count: b.delivered,
    read_count: b.read,
    replied_count: b.replied,
    failed_count: b.failed,
  }))

  const automations = [
    ['Welcome new customers', 'Greets first-time contacts and asks how to help.', 'first_inbound_message', {}, true, 412],
    ['Price enquiry reply', 'Sends the price list when a message mentions “price”.', 'keyword_match', { keywords: ['price', 'cost'], match_type: 'contains' }, true, 188],
    ['Out of office', 'Auto-replies outside 9am–8pm.', 'time_based', {}, false, 37],
  ].map(([name, description, trigger_type, trigger_config, is_active, execution_count], i) => ({
    ...base(60 * 24 * (25 - i)),
    id: id('a', i + 1),
    name,
    description,
    trigger_type,
    trigger_config,
    is_active,
    execution_count,
    last_executed_at: minutesAgo(15 + i * 90),
  }))
  const automationSteps = automations.map((a, i) => ({
    id: id('as', i + 1),
    automation_id: a.id,
    parent_step_id: null,
    branch: null,
    step_type: 'send_message',
    step_config: { message: ['Welcome to Olive & Thread! How can we help today?', 'Here is our price list: https://example.com/prices', 'Thanks for your message! We reply from 9am to 8pm.'][i] },
    position: 0,
    created_at: daysAgo(25 - i),
  }))

  return {
    profiles: [
      { id: id('pr', 1), user_id: DEMO_USER_ID, account_id: DEMO_ACCOUNT_ID, account_role: 'owner', full_name: 'Asha Kumar', email: DEMO_EMAIL, avatar_url: null, role: 'admin', beta_features: [], created_at: daysAgo(60) },
      { id: id('pr', 2), user_id: DEMO_AGENT_ID, account_id: DEMO_ACCOUNT_ID, account_role: 'agent', full_name: 'Rahul Iyer', email: 'rahul@autoshift.app', avatar_url: null, role: 'agent', beta_features: [], created_at: daysAgo(40) },
    ],
    accounts: [{ id: DEMO_ACCOUNT_ID, name: 'Olive & Thread', owner_user_id: DEMO_USER_ID, default_currency: 'INR', created_at: daysAgo(60), updated_at: daysAgo(1) }],
    contacts,
    tags,
    contact_tags: contactTags,
    conversations,
    messages,
    pipelines: [{ ...base(60 * 24 * 30), id: pipelineId, name: 'Sales' }],
    pipeline_stages: stages,
    deals,
    message_templates: templates,
    broadcasts,
    broadcast_recipients: [],
    automations,
    automation_steps: automationSteps,
    automation_logs: [],
    notifications: [
      { id: id('n', 1), account_id: DEMO_ACCOUNT_ID, user_id: DEMO_USER_ID, type: 'conversation_assigned', conversation_id: conversations[1].id, contact_id: contacts[1].id, actor_user_id: DEMO_AGENT_ID, title: 'Arjun Mehta was assigned to you', body: 'Can I book a site visit on Saturday at 11?', read_at: null, created_at: minutesAgo(20) },
      { id: id('n', 2), account_id: DEMO_ACCOUNT_ID, user_id: DEMO_USER_ID, type: 'conversation_assigned', conversation_id: conversations[3].id, contact_id: contacts[3].id, actor_user_id: DEMO_AGENT_ID, title: 'Leo Fernandes was assigned to you', body: 'Payment done ✅', read_at: minutesAgo(30), created_at: minutesAgo(60) },
    ],
    quick_replies: [
      { ...base(60 * 24 * 9), id: id('q', 1), title: 'Store hours', kind: 'text', content_text: 'We’re open 10am–8pm, Monday to Saturday.' },
      { ...base(60 * 24 * 8), id: id('q', 2), title: 'Shipping', kind: 'text', content_text: 'Orders ship within 24 hours and arrive in 2–4 days.' },
    ],
    custom_fields: [{ ...base(60 * 24 * 12), id: id('cf', 1), field_name: 'City', field_type: 'text', field_options: {} }],
    contact_custom_values: [],
    contact_notes: [],
    flows: [],
    flow_runs: [],
    ai_configs: [],
    api_keys: [],
    webhook_endpoints: [],
    whatsapp_config: [],
    account_invitations: [],
    message_reactions: [],
  }
}

/** Illustrative numbers for the dashboard's `dashboard_overview` RPC. */
export function demoOverview(days: number, timeZone: string): Row {
  const day = 864e5
  const now = Date.now()
  const points = days === 1 ? 24 : days
  const series = Array.from({ length: points }, (_, i) => {
    const t = new Date(now - (days === 1 ? (points - 1 - i) * 36e5 : (points - 1 - i) * day)).toISOString()
    const w = Math.sin(i / 1.7) * 0.5 + 1
    return { t, incoming: Math.round(38 * w + 10), outgoing: Math.round(41 * w + 6), newConversations: Math.round(9 * w), resolved: Math.round(7 * w), dealsWon: i % 3 === 0 ? 1 : 0 }
  })
  const queue = [
    ['Priya Raman', '+919876543210', 'Yes please! Can it reach Coimbatore by Friday?', 4, null],
    ['Arjun Mehta', '+919962011873', 'Great, thanks!', 18, DEMO_AGENT_ID],
    ['Meena Iyer', '+919445012345', 'Around 35, mixed sizes.', 140, null],
  ].map(([contactName, contactPhone, preview, m, agent], i) => ({
    conversationId: id('cv', [1, 2, 5][i]),
    contactName,
    contactPhone,
    avatarUrl: null,
    preview,
    waitingSince: minutesAgo(m as number),
    windowClosesAt: new Date(now + (24 * 60 - (m as number)) * 60_000).toISOString(),
    assignedAgentId: agent,
    handedOff: i === 0,
  }))
  return {
    generatedAt: new Date().toISOString(),
    timeZone,
    days,
    unit: days === 1 ? 'hour' : 'day',
    periodStart: new Date(now - days * day).toISOString(),
    previousStart: new Date(now - 2 * days * day).toISOString(),
    previousEnd: new Date(now - days * day).toISOString(),
    replyTargetMinutes: 15,
    attention: { waiting: 3, oldestWaitingSince: minutesAgo(140), waitingOverTarget: 2, unassigned: 2, windowsClosing: 0, failed: 0, failedMessages: [], queue },
    replies: {
      medianHuman: 6.5,
      medianHumanPrevious: 9.2,
      ai: { replies: 412, medianMinutes: 0.2 },
      team: [
        { userId: DEMO_USER_ID, name: 'Asha Kumar', avatarUrl: null, role: 'owner', presence: 'online', lastSeenAt: minutesAgo(1), open: 3, replies: 86, medianMinutes: 5.1 },
        { userId: DEMO_AGENT_ID, name: 'Rahul Iyer', avatarUrl: null, role: 'agent', presence: 'away', lastSeenAt: minutesAgo(25), open: 2, replies: 54, medianMinutes: 8.4 },
      ],
    },
    volume: { series, hourly: [2, 1, 0, 0, 0, 1, 3, 8, 14, 19, 22, 24, 21, 18, 20, 23, 25, 22, 17, 12, 9, 6, 4, 3] },
    kpis: { newConversations: 64, newConversationsPrevious: 51, resolved: 49, resolvedPrevious: 44, dealsWon: 2, dealsWonPrevious: 1, dealsWonValue: 59000, broadcastDelivered: 2451, broadcastRead: 1695, broadcastDeliveredPrevious: 2010, broadcastReadPrevious: 1304 },
    pipeline: {
      pipelines: [{ id: id('p', 1), name: 'Sales' }],
      stages: [['New lead', '#3b82f6', 1, 38000], ['Qualified', '#f59e0b', 2, 58500], ['Proposal', '#8b5cf6', 1, 74000], ['Won', '#10b981', 2, 21000]].map(([name, color, dealCount, totalValue], i) => ({ id: id('ps', i + 1), pipelineId: id('p', 1), name, color, dealCount, totalValue })),
      stats: [{ pipelineId: id('p', 1), won: 2, lost: 0, avgDaysToWin: 6.4, idleDeals: 1 }],
    },
    campaigns: {
      latestBroadcast: { id: id('b', 1), name: 'Festive sale', status: 'sent', at: minutesAgo(60 * 48), recipients: 1900, delivered: 1830, read: 1262, replied: 214, failed: 70 },
      automationRuns: 637,
      automationFailed: 0,
      flowFailed: 0,
      topFailingFlow: null,
      templatesApproved: 2,
      templatesRejected: 0,
    },
    setup: { whatsappConnected: false, hasContacts: true, hasApprovedTemplate: true, memberCount: 2, hasConversations: true },
  }
}
