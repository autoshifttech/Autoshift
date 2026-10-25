/**
 * Insights: sample analytics for the chosen period, deterministic so the
 * server render and the browser agree. Replaced by real queries when the
 * backend lands.
 */

export const RANGES = [7, 30, 90] as const
export type Range = (typeof RANGES)[number]

export interface DayPoint {
  date: string
  aiConversations: number
  teamConversations: number
  hot: number
  warm: number
  cold: number
  bookings: number
}

export interface Insights {
  days: DayPoint[]
  totals: {
    conversations: number
    aiResolved: number
    medianReplySec: number
    leads: number
    bookings: number
    revenue: number
    previous: { conversations: number; leads: number; bookings: number; revenue: number }
  }
  funnel: { stage: 'conversations' | 'leads' | 'qualified' | 'booked' | 'won'; value: number }[]
  sources: { source: 'whatsapp_ad' | 'website' | 'campaign' | 'organic' | 'referral'; leads: number; won: number }[]
  assistants: { name: string; replies: number; resolved: number; leads: number; bookings: number; handoffs: number }[]
  campaigns: { name: string; kind: 'broadcast' | 'drip'; sent: number; read: number; replied: number; booked: number; cost: number }[]
  /** 7 rows (Mon–Sun) × 24 hours of incoming messages. */
  heat: number[][]
}

const wave = (i: number, period: number, amp = 0.35) => 1 + Math.sin(i / period) * amp

export function buildInsights(range: Range, now = new Date('2026-10-25T12:00:00Z')): Insights {
  const days: DayPoint[] = Array.from({ length: range }, (_, k) => {
    const i = range - 1 - k
    const d = new Date(now.getTime() - i * 864e5)
    const weekday = d.getUTCDay()
    const weekend = weekday === 0 || weekday === 6 ? 0.75 : 1
    const w = wave(k, 2.6) * weekend
    const ai = Math.round(48 * w)
    const team = Math.round(14 * wave(k + 3, 3.1, 0.4) * weekend)
    return {
      date: d.toISOString().slice(0, 10),
      aiConversations: ai,
      teamConversations: team,
      hot: Math.round(3 * wave(k, 1.9, 0.6)),
      warm: Math.round(5 * wave(k + 1, 2.2, 0.5)),
      cold: Math.round(4 * wave(k + 2, 2.8, 0.5)),
      bookings: Math.round(4 * wave(k + 1, 2.4, 0.5) * weekend),
    }
  })
  const sum = (f: (d: DayPoint) => number) => days.reduce((s, d) => s + f(d), 0)
  const conversations = sum((d) => d.aiConversations + d.teamConversations)
  const leads = sum((d) => d.hot + d.warm + d.cold)
  const bookings = sum((d) => d.bookings)
  const qualified = sum((d) => d.hot + d.warm)
  const won = Math.round(bookings * 0.55)
  const scale = range / 30

  const heat = Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, h) => {
      const office = h >= 9 && h <= 21 ? 1 : 0.15
      const evening = h >= 18 && h <= 21 ? 1.4 : 1
      const weekend = day >= 5 ? 0.7 : 1
      return Math.round(22 * office * evening * weekend * wave(h + day, 2.5, 0.25))
    }),
  )

  return {
    days,
    totals: {
      conversations,
      aiResolved: Math.round(sum((d) => d.aiConversations) * 0.78),
      medianReplySec: 14,
      leads,
      bookings,
      revenue: bookings * 1450,
      previous: { conversations: Math.round(conversations * 0.86), leads: Math.round(leads * 0.8), bookings: Math.round(bookings * 0.9), revenue: Math.round(bookings * 1450 * 0.84) },
    },
    funnel: [
      { stage: 'conversations', value: conversations },
      { stage: 'leads', value: leads },
      { stage: 'qualified', value: qualified },
      { stage: 'booked', value: bookings },
      { stage: 'won', value: won },
    ],
    sources: [
      { source: 'whatsapp_ad', leads: Math.round(leads * 0.42), won: Math.round(won * 0.45) },
      { source: 'website', leads: Math.round(leads * 0.21), won: Math.round(won * 0.18) },
      { source: 'campaign', leads: Math.round(leads * 0.17), won: Math.round(won * 0.14) },
      { source: 'organic', leads: Math.round(leads * 0.12), won: Math.round(won * 0.11) },
      { source: 'referral', leads: Math.round(leads * 0.08), won: Math.round(won * 0.12) },
    ],
    assistants: [
      { name: 'Sales assistant', replies: Math.round(1156 * scale), resolved: 74, leads: Math.round(64 * scale), bookings: Math.round(41 * scale), handoffs: Math.round(38 * scale) },
      { name: 'Support assistant', replies: Math.round(768 * scale), resolved: 82, leads: 0, bookings: Math.round(6 * scale), handoffs: Math.round(52 * scale) },
    ],
    campaigns: [
      { name: 'New lead nurture', kind: 'drip', sent: Math.round(1077 * scale), read: 82, replied: 17, booked: Math.round(64 * scale), cost: Math.round(1077 * scale * 0.7) },
      { name: 'Festive sale', kind: 'broadcast', sent: 1900, read: 69, replied: 11, booked: 38, cost: 1881 },
      { name: 'Win-back after 60 days', kind: 'drip', sent: Math.round(175 * scale), read: 70, replied: 10, booked: Math.round(9 * scale), cost: Math.round(175 * scale * 0.99) },
      { name: 'Restock alert — linen', kind: 'broadcast', sent: 640, read: 68, replied: 9, booked: 12, cost: 634 },
    ],
    heat,
  }
}

export function change(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}
