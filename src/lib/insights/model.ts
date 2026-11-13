/** Insights: the shapes the page shows. The numbers come from `./live` (the account's own rows). */

export const RANGES = [7, 30, 90] as const
export type Range = (typeof RANGES)[number]

export interface DayPoint {
  date: string
  aiConversations: number
  teamConversations: number
  hot: number
  warm: number
  cold: number
}

export interface Insights {
  days: DayPoint[]
  totals: {
    conversations: number
    aiResolved: number
    medianReplySec: number
    leads: number
    previous: { conversations: number; leads: number }
  }
  funnel: { stage: 'conversations' | 'leads' | 'qualified' | 'won'; value: number }[]
  sources: { source: 'whatsapp_ad' | 'website' | 'campaign' | 'organic' | 'referral'; leads: number; won: number }[]
  assistants: { name: string; replies: number; resolved: number; leads: number; handoffs: number }[]
  campaigns: { name: string; kind: 'broadcast' | 'drip'; sent: number; read: number; replied: number; cost: number }[]
  /** 7 rows (Mon–Sun) × 24 hours of incoming messages. */
  heat: number[][]
}

export function change(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}
