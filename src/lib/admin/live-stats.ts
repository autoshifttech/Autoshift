/**
 * Real numbers for the admin panel's charts (only with the backend: NEXT_PUBLIC_API_URL).
 * Loaded once from /v1/platform/stats after the staff check. Without the backend (design
 * preview) the pages keep their sample data.
 */
import { createStore, useStore } from '@/lib/workspace/store'
import { backend, backendUrl } from '@/lib/backend/client'
import { AI_DAYS, JOBS, MONTHS, SERVICES, SYSTEM_EVENTS, WEBHOOK_HOURS, type AiDay, type Job, type MonthPoint, type ServiceStatus, type SystemEvent } from './data'

export interface LiveWhatsApp {
  status: string
  phone_number_id: string | null
  connected_at: string | null
  approved: number
  rejected: number
  failed_24h: number
  error: string | null
}

export interface AdminStats {
  loaded: boolean
  months: MonthPoint[]
  ai_days: AiDay[]
  webhook_hours: { hour: string; delivered: number; failed: number }[]
  services: ServiceStatus[]
  events: SystemEvent[]
  jobs: Job[]
  whatsapp: Record<string, LiveWhatsApp>
  rejected_templates: { businessId: string; template: string; reason: string; at: string }[]
}

const DEMO: AdminStats = { loaded: true, months: MONTHS, ai_days: AI_DAYS, webhook_hours: WEBHOOK_HOURS, services: SERVICES, events: SYSTEM_EVENTS, jobs: JOBS, whatsapp: {}, rejected_templates: [] }
const emptyMonths = (): MonthPoint[] =>
  Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - (11 - i))
    return { month: d.toLocaleString('en', { month: 'short' }), signups: 0, paying: 0, mrr: 0, subscriptions: 0, topups: 0, metaCost: 0, aiCost: 0 }
  })
const EMPTY: AdminStats = { loaded: false, months: emptyMonths(), ai_days: [], webhook_hours: [], services: [], events: [], jobs: [], whatsapp: {}, rejected_templates: [] }

export const adminStatsStore = createStore<AdminStats>(() => (backendUrl() ? EMPTY : DEMO))
export const useAdminStats = () => useStore(adminStatsStore, backendUrl() ? EMPTY : DEMO)

export async function loadAdminStats(): Promise<void> {
  const s = await backend<Omit<AdminStats, 'loaded' | 'jobs' | 'services'> & { services: Omit<ServiceStatus, 'uptime' | 'latencyMs'>[] }>('/v1/platform/stats')
  adminStatsStore.set({
    ...s,
    loaded: true,
    jobs: [],
    // Uptime and latency aren't measured yet: the page shows them only when they're above zero.
    services: s.services.map((x) => ({ ...x, uptime: 0, latencyMs: 0 })),
  })
}
