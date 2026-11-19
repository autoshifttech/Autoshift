import { describe, expect, it } from 'vitest'
import { byDay, inView, type Appointment } from './appointments'

const at = (iso: string, status: Appointment['status'] = 'booked', id = iso): Appointment => ({
  id, number: 1, service: 'Haircut', minutes: 30, price_paise: 0, starts_at: iso, ends_at: iso,
  customer_name: '', customer_phone: '', note: '', status, source: 'ai', conversation_id: null, reminded_at: null, reminder_error: null,
})

describe('appointments views', () => {
  const now = new Date(2026, 10, 19, 12, 0)
  it('sorts booked appointments into today, upcoming and past', () => {
    const later = at(new Date(2026, 10, 19, 15, 0).toISOString())
    const earlier = at(new Date(2026, 10, 19, 9, 0).toISOString())
    const tomorrow = at(new Date(2026, 10, 20, 10, 0).toISOString())
    expect(inView(later, 'today', now)).toBe(true)
    expect(inView(earlier, 'today', now)).toBe(true)
    expect(inView(tomorrow, 'today', now)).toBe(false)
    expect(inView(later, 'upcoming', now)).toBe(true)
    expect(inView(earlier, 'upcoming', now)).toBe(false)
    expect(inView(earlier, 'past', now)).toBe(true)
  })
  it('keeps cancelled ones only in the cancelled view, and done ones in past', () => {
    const c = at(new Date(2026, 10, 20, 10, 0).toISOString(), 'cancelled')
    expect(inView(c, 'cancelled', now)).toBe(true)
    expect(inView(c, 'upcoming', now)).toBe(false)
    expect(inView(c, 'today', now)).toBe(false)
    const done = at(new Date(2026, 10, 20, 10, 0).toISOString(), 'completed')
    expect(inView(done, 'upcoming', now)).toBe(false)
    expect(inView(done, 'past', now)).toBe(true)
  })
  it('groups by local day in time order', () => {
    const a = at(new Date(2026, 10, 20, 10, 0).toISOString(), 'booked', 'a')
    const b = at(new Date(2026, 10, 19, 16, 0).toISOString(), 'booked', 'b')
    const c = at(new Date(2026, 10, 19, 9, 0).toISOString(), 'booked', 'c')
    const groups = byDay([a, b, c])
    expect(groups.map((g) => g.day)).toEqual(['2026-11-19', '2026-11-20'])
    expect(groups[0].items.map((x) => x.id)).toEqual(['c', 'b'])
  })
})
