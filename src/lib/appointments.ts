// ============================================================
// Appointments (clinics, salons …): bookings the AI or the team made, and the booking settings
// (services, opening hours). Read from the database; every change goes through the backend.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isLive } from '@/lib/workspace/live'
import { backend } from '@/lib/backend/client'

export type AppointmentStatus = 'booked' | 'completed' | 'no_show' | 'cancelled'
export type AppointmentAction = 'completed' | 'no_show' | 'cancelled'

export interface Appointment {
  id: string
  number: number
  service: string
  minutes: number
  price_paise: number
  starts_at: string
  ends_at: string
  customer_name: string
  customer_phone: string
  note: string
  status: AppointmentStatus
  source: 'ai' | 'manual'
  conversation_id: string | null
  reminded_at: string | null
  reminder_error: string | null
}

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Day = (typeof DAYS)[number]

export interface BookingService {
  name: string
  minutes: number
  price: number
}

export interface BookingSettings {
  services: BookingService[]
  hours: Record<Day, string[][]>
  timezone: string
  slot_minutes: number
  per_slot: number
  days_ahead: number
  min_notice_minutes: number
  reminders: boolean
  language: 'en' | 'pt' | 'es' | 'ko'
  /** The business's own approved reminder template ({{n}} → field); null = AutoShift's. */
  reminder_template?: { name: string; language: string; vars: string[] } | null
}

export const APPOINTMENT_VIEWS = ['today', 'upcoming', 'past', 'cancelled'] as const
export type AppointmentView = (typeof APPOINTMENT_VIEWS)[number]

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export function inView(a: Appointment, view: AppointmentView, now = new Date()): boolean {
  const start = new Date(a.starts_at)
  if (view === 'cancelled') return a.status === 'cancelled'
  if (a.status === 'cancelled') return false
  if (view === 'today') return dayKey(start) === dayKey(now)
  if (view === 'upcoming') return start.getTime() >= now.getTime() && a.status === 'booked'
  return start.getTime() < now.getTime() || a.status !== 'booked'
}

/** Appointments grouped by local day, in time order (the page's list). */
export function byDay(list: Appointment[]): { day: string; items: Appointment[] }[] {
  const groups = new Map<string, Appointment[]>()
  for (const a of [...list].sort((x, y) => x.starts_at.localeCompare(y.starts_at))) {
    const d = new Date(a.starts_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    groups.set(key, [...(groups.get(key) ?? []), a])
  }
  return [...groups.entries()].map(([day, items]) => ({ day, items }))
}

const COLUMNS = 'id, number, service, minutes, price_paise, starts_at, ends_at, customer_name, customer_phone, note, status, source, conversation_id, reminded_at, reminder_error'

/** The last 30 days and everything ahead, refreshed every 30 seconds while open. */
export function useAppointments() {
  const [items, setItems] = useState<Appointment[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    if (!isLive()) {
      setLoaded(true)
      return
    }
    const since = new Date(Date.now() - 30 * 864e5).toISOString()
    const { data, error: err } = await createClient().from('appointments').select(COLUMNS).gte('starts_at', since).order('starts_at', { ascending: true }).limit(500)
    if (err) setError(true)
    else {
      setItems((data ?? []) as Appointment[])
      setError(false)
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    const first = setTimeout(() => void load(), 0)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 30000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [load])

  return { items, loaded, error, reload: load }
}

export const getBookingSettings = () => backend<BookingSettings>('/v1/appointments/settings')
export const saveBookingSettings = (s: BookingSettings) => backend<BookingSettings>('/v1/appointments/settings', { method: 'PUT', body: s })
export const freeSlots = (service: string, days = 14) => backend<string[]>(`/v1/appointments/slots?service=${encodeURIComponent(service)}&days=${days}`)
export const addAppointment = (body: { service: string; start: string; name: string; phone: string; note: string }) =>
  backend<Appointment>('/v1/appointments', { method: 'POST', body })
export const updateAppointment = (id: string, action: AppointmentAction, notify = true) =>
  backend<{ appointment: Appointment; notified: boolean; not_notified_reason: string | null }>(`/v1/appointments/${id}`, { method: 'PATCH', body: { action, notify } })

export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}
