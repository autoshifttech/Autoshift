/**
 * Insights for real accounts, worked out from the account's own rows (row-level security keeps
 * it to this business): chats, messages, pipeline deals, broadcasts and AI usage.
 * The demo keeps `buildInsights` sample numbers.
 */
import { createClient } from '@/lib/supabase/client'
import type { DayPoint, Insights, Range } from './model'

const MAX = 10000
const PRICE: Record<string, number> = { Marketing: 0.99, Utility: 0.15, Authentication: 0.15 }

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function median(values: number[]): number {
  if (!values.length) return 0
  const v = [...values].sort((a, b) => a - b)
  return Math.round(v[Math.floor(v.length / 2)])
}

interface Conv {
  id: string
  created_at: string
  ai_reply_count: number | null
  ai_handoff_summary: string | null
  assigned_agent_id: string | null
}
interface Deal {
  id: string
  status: string
  stage_id: string | null
  created_at: string
}

export async function loadLiveInsights(range: Range, now = new Date()): Promise<Insights> {
  const sb = createClient()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (range - 1))
  const prevStart = new Date(start)
  prevStart.setDate(prevStart.getDate() - range)
  const since = start.toISOString()

  const [convRes, prevConvRes, dealRes, prevDealRes, msgRes, bcRes, usageRes, asstRes, stageRes] = await Promise.all([
    sb.from('conversations').select('id, created_at, ai_reply_count, ai_handoff_summary, assigned_agent_id').gte('created_at', since).limit(MAX),
    sb.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', prevStart.toISOString()).lt('created_at', since),
    sb.from('deals').select('id, status, stage_id, created_at').gte('created_at', since).limit(MAX),
    sb.from('deals').select('id', { count: 'exact', head: true }).gte('created_at', prevStart.toISOString()).lt('created_at', since),
    sb.from('messages').select('conversation_id, sender_type, created_at').gte('created_at', since).order('created_at', { ascending: true }).limit(MAX),
    sb.from('broadcasts').select('name, template_name, sent_count, read_count, replied_count, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(50),
    sb.from('ai_usage_log').select('id', { count: 'exact', head: true }).gte('created_at', since),
    sb.from('assistants').select('name, enabled').limit(20),
    sb.from('pipeline_stages').select('id, position'),
  ])
  for (const r of [convRes, dealRes, msgRes]) if (r.error) throw new Error(r.error.message)

  const convs = (convRes.data ?? []) as Conv[]
  const deals = (dealRes.data ?? []) as Deal[]
  const msgs = msgRes.data ?? []
  const stagePos = new Map((stageRes.data ?? []).map((s) => [s.id as string, Number(s.position ?? 0)]))

  // Days: chats started each day (handled by AI if the AI replied in them), and new leads.
  // Leads have no temperature until lead-capture answers are saved, so they count as cold.
  const byDay = new Map<string, DayPoint>()
  for (let i = 0; i < range; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    byDay.set(dayKey(d), { date: dayKey(d), aiConversations: 0, teamConversations: 0, hot: 0, warm: 0, cold: 0 })
  }
  for (const c of convs) {
    const p = byDay.get(dayKey(new Date(c.created_at)))
    if (!p) continue
    if ((c.ai_reply_count ?? 0) > 0) p.aiConversations++
    else p.teamConversations++
  }
  for (const d of deals) {
    const p = byDay.get(dayKey(new Date(d.created_at)))
    if (p) p.cold++
  }

  // Reply speed: from a customer's first message in a chat to the first answer after it.
  const firstIn = new Map<string, number>()
  const replySec: number[] = []
  const answered = new Set<string>()
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const m of msgs) {
    const at = new Date(m.created_at)
    if (m.sender_type === 'customer') {
      if (!firstIn.has(m.conversation_id)) firstIn.set(m.conversation_id, at.getTime())
      heat[(at.getDay() + 6) % 7][at.getHours()]++ // rows start on Monday
    } else if (firstIn.has(m.conversation_id) && !answered.has(m.conversation_id)) {
      answered.add(m.conversation_id)
      replySec.push((at.getTime() - firstIn.get(m.conversation_id)!) / 1000)
    }
  }

  const aiChats = convs.filter((c) => (c.ai_reply_count ?? 0) > 0)
  const handoffs = aiChats.filter((c) => c.ai_handoff_summary || c.assigned_agent_id).length
  const won = deals.filter((d) => d.status === 'won').length
  const qualified = deals.filter((d) => d.status === 'won' || (d.status === 'open' && (stagePos.get(d.stage_id ?? '') ?? 0) > 0)).length

  const templates = new Map<string, string>()
  const bcs = bcRes.data ?? []
  const names = [...new Set(bcs.map((b) => b.template_name).filter(Boolean))]
  if (names.length) {
    const { data } = await sb.from('message_templates').select('name, category').in('name', names)
    for (const t of data ?? []) templates.set(t.name, t.category)
  }
  const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)
  const enabled = (asstRes.data ?? []).filter((a) => a.enabled)
  const aiReplies = usageRes.count ?? 0

  return {
    days: [...byDay.values()],
    totals: {
      conversations: convs.length,
      aiResolved: aiChats.length - handoffs,
      medianReplySec: median(replySec),
      leads: deals.length,
      previous: { conversations: prevConvRes.count ?? 0, leads: prevDealRes.count ?? 0 },
    },
    funnel: [
      { stage: 'conversations', value: convs.length },
      { stage: 'leads', value: deals.length },
      { stage: 'qualified', value: qualified },
      { stage: 'won', value: won },
    ],
    // Where leads come from isn't recorded yet, so this stays empty rather than guessing.
    sources: [],
    assistants:
      aiReplies || aiChats.length
        ? [{ name: enabled.length === 1 ? enabled[0].name : 'AI', replies: aiReplies, resolved: pct(aiChats.length - handoffs, aiChats.length), leads: 0, handoffs }]
        : [],
    campaigns: bcs.map((b) => ({
      name: b.name || b.template_name,
      kind: 'broadcast' as const,
      sent: b.sent_count ?? 0,
      read: pct(b.read_count ?? 0, b.sent_count ?? 0),
      replied: pct(b.replied_count ?? 0, b.sent_count ?? 0),
      cost: Math.round((b.sent_count ?? 0) * (PRICE[templates.get(b.template_name) ?? 'Marketing'] ?? 0.99)),
    })),
    heat,
  }
}

/** Zeros for the chosen period, shown while real numbers load. */
export function emptyInsights(range: Range, now = new Date()): Insights {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (range - 1))
  const days = Array.from({ length: range }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return { date: dayKey(d), aiConversations: 0, teamConversations: 0, hot: 0, warm: 0, cold: 0 }
  })
  return {
    days,
    totals: { conversations: 0, aiResolved: 0, medianReplySec: 0, leads: 0, previous: { conversations: 0, leads: 0 } },
    funnel: [
      { stage: 'conversations', value: 0 },
      { stage: 'leads', value: 0 },
      { stage: 'qualified', value: 0 },
      { stage: 'won', value: 0 },
    ],
    sources: [],
    assistants: [],
    campaigns: [],
    heat: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
  }
}
