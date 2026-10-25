import { describe, expect, it } from 'vitest'
import { addDays, availableSlots, isoDate, renderConfirmation, sampleBookingState, startOfWeek, type BookingState } from './model'

// A Wednesday morning, so "tomorrow" is a normal working day.
const NOW = new Date('2026-10-28T08:00:00')
const TODAY = isoDate(NOW)

function state(patch: Partial<BookingState> = {}): BookingState {
  return { ...sampleBookingState(NOW), bookings: [], breaks: [], holidays: [], ...patch }
}

describe('availableSlots', () => {
  const s = state()
  const haircut = s.services.find((x) => x.id === 'sv1')!
  const meera = s.staff[0]

  it('steps through working hours and stops before closing', () => {
    const slots = availableSlots(s, haircut, meera, addDays(TODAY, 1), NOW)
    expect(slots[0]).toBe('10:00')
    expect(slots.at(-1)).toBe('18:00') // 18:00 + 45 min ends before 19:00
    expect(slots).not.toContain('18:30')
  })

  it('respects minimum notice today', () => {
    const later = new Date('2026-10-28T11:10:00')
    expect(availableSlots(s, haircut, meera, TODAY, later)[0]).toBe('13:30') // 11:10 + 2h notice
  })

  it('skips breaks, holidays and closed days', () => {
    const withBreak = state({ breaks: [{ start: '13:30', end: '14:00' }] })
    const day = addDays(TODAY, 1)
    const slots = availableSlots(withBreak, haircut, meera, day, NOW)
    expect(slots).not.toContain('13:00') // 13:00–13:45 overlaps the break
    expect(slots).not.toContain('13:30')
    expect(slots).toContain('14:00')
    expect(availableSlots(state({ holidays: [{ date: day, label: 'x' }] }), haircut, meera, day, NOW)).toEqual([])
    const sunday = addDays(startOfWeek(TODAY), 6)
    expect(availableSlots(s, haircut, meera, sunday, NOW)).toEqual([])
  })

  it('blocks slots that clash with a booking plus its buffer', () => {
    const day = addDays(TODAY, 1)
    const booked = state({
      bookings: [{ id: 'b', contactName: 'x', phone: '1', serviceId: 'sv1', staffId: meera.id, date: day, start: '11:00', status: 'confirmed', source: 'ai', notes: '', createdAt: '' }],
    })
    const slots = availableSlots(booked, haircut, meera, day, NOW)
    expect(slots).not.toContain('10:30') // 10:30 + 45 + 15 buffer runs into 11:00
    expect(slots).not.toContain('11:00')
    expect(slots).not.toContain('11:30') // the 11:00 booking runs until 12:00 with buffer
    expect(slots).toContain('12:00')
    // Another staff member is still free.
    expect(availableSlots(booked, haircut, s.staff[1], day, NOW)).toContain('11:00')
  })

  it('ignores cancelled bookings and honours capacity per slot', () => {
    const day = addDays(TODAY, 1)
    const b = { id: 'b', contactName: 'x', phone: '1', serviceId: 'sv1', staffId: meera.id, date: day, start: '11:00', source: 'ai' as const, notes: '', createdAt: '' }
    expect(availableSlots(state({ bookings: [{ ...b, status: 'cancelled' }] }), haircut, meera, day, NOW)).toContain('11:00')
    const two = state({ bookings: [{ ...b, status: 'confirmed' }], rules: { ...s.rules, perSlot: 2 } })
    expect(availableSlots(two, haircut, meera, day, NOW)).toContain('11:00')
  })

  it('stays inside the booking window', () => {
    expect(availableSlots(s, haircut, meera, addDays(TODAY, -1), NOW)).toEqual([])
    expect(availableSlots(s, haircut, meera, addDays(TODAY, s.rules.maxAdvanceDays + 1), NOW)).toEqual([])
  })
})

describe('helpers', () => {
  it('finds Monday of the week', () => {
    expect(startOfWeek('2026-10-28')).toBe('2026-10-26')
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26') // Sunday belongs to the week before
  })

  it('fills confirmation variables and keeps unknown ones', () => {
    expect(renderConfirmation('Hi {{name}} at {{time}} {{x}}', { name: 'Priya', time: '14:30' })).toBe('Hi Priya at 14:30 {{x}}')
  })
})
