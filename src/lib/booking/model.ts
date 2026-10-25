/**
 * Appointment booking: types, slot calculation and the sample workspace
 * used until the booking tables exist in Supabase. Times are wall-clock
 * "HH:MM" in the business time zone; dates are "YYYY-MM-DD".
 */
import { createStore, useStore } from '@/lib/workspace/store'

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Sunday
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0]

export interface TimeRange {
  start: string
  end: string
}

export interface DayHours {
  open: boolean
  ranges: TimeRange[]
}

export type WeeklyHours = Record<Weekday, DayHours>

export interface Staff {
  id: string
  name: string
  color: string
  /** null = follows the business hours. */
  hours: WeeklyHours | null
}

export interface Service {
  id: string
  name: string
  durationMin: number
  price: number
  bufferMin: number
  staffIds: string[]
  color: string
  active: boolean
  description: string
}

export type BookingStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled' | 'no_show'
export const BOOKING_STATUSES: BookingStatus[] = ['confirmed', 'pending', 'completed', 'cancelled', 'no_show']

export interface Booking {
  id: string
  contactName: string
  phone: string
  serviceId: string
  staffId: string
  date: string
  start: string
  status: BookingStatus
  source: 'ai' | 'staff' | 'customer'
  notes: string
  createdAt: string
}

export interface Holiday {
  date: string
  label: string
}

export interface BookingRules {
  minNoticeHours: number
  maxAdvanceDays: number
  slotStepMin: number
  /** Bookings allowed in the same slot for one staff member. */
  perSlot: number
  confirmationMessage: string
  allowCustomerCancel: boolean
}

export interface BookingState {
  hours: WeeklyHours
  breaks: TimeRange[]
  holidays: Holiday[]
  staff: Staff[]
  services: Service[]
  bookings: Booking[]
  rules: BookingRules
}

// --- time helpers -----------------------------------------------------------

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export const fromMinutes = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

export const weekdayOf = (date: string) => new Date(`${date}T00:00:00`).getDay() as Weekday

/** Monday of the week containing `date`. */
export function startOfWeek(date: string): string {
  const wd = weekdayOf(date)
  return addDays(date, wd === 0 ? -6 : 1 - wd)
}

export const bookingEnd = (b: Booking, service: Service | undefined) =>
  fromMinutes(toMinutes(b.start) + (service?.durationMin ?? 30))

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd

/**
 * Free start times for `service` with `staff` on `date`: inside working
 * hours, outside breaks and holidays, respecting duration + buffer, the
 * per-slot capacity, minimum notice and the booking window.
 */
export function availableSlots(
  state: Pick<BookingState, 'hours' | 'breaks' | 'holidays' | 'bookings' | 'rules' | 'services'>,
  service: Service,
  staff: Staff,
  date: string,
  now: Date = new Date(),
): string[] {
  const { rules } = state
  if (state.holidays.some((h) => h.date === date)) return []
  const today = isoDate(now)
  if (date < today || date > addDays(today, rules.maxAdvanceDays)) return []

  const day = (staff.hours ?? state.hours)[weekdayOf(date)]
  if (!day?.open) return []

  const earliest = date === today ? now.getHours() * 60 + now.getMinutes() + rules.minNoticeHours * 60 : -1
  const length = service.durationMin + service.bufferMin
  const taken = state.bookings
    .filter((b) => b.date === date && b.staffId === staff.id && b.status !== 'cancelled')
    .map((b) => {
      const s = state.services.find((x) => x.id === b.serviceId)
      const start = toMinutes(b.start)
      return { start, end: start + (s ? s.durationMin + s.bufferMin : 30) }
    })

  const slots: string[] = []
  for (const range of day.ranges) {
    const open = toMinutes(range.start)
    const close = toMinutes(range.end)
    for (let t = open; t + service.durationMin <= close; t += rules.slotStepMin) {
      if (t < earliest) continue
      if (state.breaks.some((br) => overlaps(t, t + service.durationMin, toMinutes(br.start), toMinutes(br.end)))) continue
      const clashes = taken.filter((b) => overlaps(t, t + length, b.start, b.end)).length
      if (clashes >= rules.perSlot) continue
      slots.push(fromMinutes(t))
    }
  }
  return slots
}

/** Fills {{name}}, {{service}}, {{date}}, {{time}}, {{staff}}, {{business}} in the confirmation text. */
export function renderConfirmation(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match)
}

// --- sample workspace -------------------------------------------------------

const range = (start: string, end: string): TimeRange => ({ start, end })

export function defaultHours(): WeeklyHours {
  const open = (): DayHours => ({ open: true, ranges: [range('10:00', '19:00')] })
  return { 0: { open: false, ranges: [range('10:00', '14:00')] }, 1: open(), 2: open(), 3: open(), 4: open(), 5: open(), 6: { open: true, ranges: [range('10:00', '16:00')] } }
}

export const DEFAULT_CONFIRMATION =
  'Hi {{name}}, your {{service}} with {{staff}} is confirmed for {{date}} at {{time}}. See you at {{business}}! Reply CANCEL to cancel or RESCHEDULE to change the time.'

export function sampleBookingState(now: Date = new Date()): BookingState {
  const staff: Staff[] = [
    { id: 'st1', name: 'Meera', color: '#1E4C41', hours: null },
    { id: 'st2', name: 'Rahul', color: '#7C5CBF', hours: null },
    { id: 'st3', name: 'Ananya', color: '#C2410C', hours: null },
  ]
  const services: Service[] = [
    { id: 'sv1', name: 'Haircut & styling', durationMin: 45, price: 800, bufferMin: 15, staffIds: ['st1', 'st2'], color: '#1E4C41', active: true, description: 'Wash, cut and blow-dry.' },
    { id: 'sv2', name: 'Hair colour', durationMin: 120, price: 3500, bufferMin: 15, staffIds: ['st1'], color: '#7C5CBF', active: true, description: 'Global colour or highlights.' },
    { id: 'sv3', name: 'Facial', durationMin: 60, price: 1800, bufferMin: 10, staffIds: ['st3'], color: '#C2410C', active: true, description: 'Deep-cleansing facial.' },
    { id: 'sv4', name: 'Consultation', durationMin: 20, price: 0, bufferMin: 0, staffIds: ['st1', 'st2', 'st3'], color: '#2563EB', active: true, description: 'Free first consultation.' },
    { id: 'sv5', name: 'Bridal package', durationMin: 240, price: 15000, bufferMin: 30, staffIds: ['st1', 'st3'], color: '#B45309', active: false, description: 'Hair, make-up and draping.' },
  ]
  const today = isoDate(now)
  const people: [string, string][] = [
    ['Priya Raman', '+91 98765 43210'],
    ['Arjun Mehta', '+91 99620 11873'],
    ['Sara Thomas', '+91 90031 55520'],
    ['Leo Fernandes', '+91 98400 72211'],
    ['Meena Iyer', '+91 94450 12345'],
    ['Kavya Nair', '+91 98844 55667'],
    ['Rahul Verma', '+91 98112 23344'],
    ['Omar Hussain', '+91 97000 12345'],
  ]
  // [day offset, start, service, staff, person, status, source]
  const plan: [number, string, string, string, number, BookingStatus, Booking['source']][] = [
    [-2, '11:00', 'sv1', 'st1', 3, 'completed', 'ai'],
    [-1, '15:00', 'sv3', 'st3', 4, 'no_show', 'staff'],
    [0, '10:30', 'sv1', 'st1', 0, 'confirmed', 'ai'],
    [0, '12:00', 'sv2', 'st1', 4, 'confirmed', 'staff'],
    [0, '11:00', 'sv3', 'st3', 2, 'confirmed', 'ai'],
    [0, '16:00', 'sv4', 'st2', 1, 'pending', 'ai'],
    [0, '17:00', 'sv1', 'st2', 6, 'confirmed', 'customer'],
    [1, '10:00', 'sv3', 'st3', 5, 'confirmed', 'ai'],
    [1, '14:30', 'sv1', 'st2', 7, 'cancelled', 'ai'],
    [1, '15:00', 'sv2', 'st1', 0, 'confirmed', 'staff'],
    [2, '11:30', 'sv1', 'st1', 1, 'confirmed', 'ai'],
    [2, '13:00', 'sv4', 'st3', 3, 'pending', 'ai'],
    [3, '10:00', 'sv1', 'st2', 2, 'confirmed', 'customer'],
    [4, '16:30', 'sv3', 'st3', 6, 'confirmed', 'ai'],
    [5, '12:00', 'sv1', 'st1', 4, 'confirmed', 'ai'],
  ]
  const bookings = plan.map(([offset, start, serviceId, staffId, p, status, source], i): Booking => ({
    id: `bk${i + 1}`,
    contactName: people[p][0],
    phone: people[p][1],
    serviceId,
    staffId,
    date: addDays(today, offset),
    start,
    status,
    source,
    notes: i === 3 ? 'Prefers ammonia-free colour.' : '',
    createdAt: new Date(now.getTime() - (i + 2) * 36e5).toISOString(),
  }))
  return {
    hours: defaultHours(),
    breaks: [range('13:30', '14:00')],
    holidays: [{ date: addDays(today, 9), label: 'Diwali' }],
    staff,
    services,
    bookings,
    rules: { minNoticeHours: 2, maxAdvanceDays: 30, slotStepMin: 30, perSlot: 1, confirmationMessage: DEFAULT_CONFIRMATION, allowCustomerCancel: true },
  }
}

export const bookingStore = createStore<BookingState>(() => sampleBookingState(), 'autoshift.booking')
const SERVER_STATE = sampleBookingState(new Date(0))
export const useBookingState = () => useStore(bookingStore, SERVER_STATE)

export function formatPrice(amount: number, currency = 'INR', locale = 'en-IN') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}
