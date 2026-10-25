import { describe, expect, it } from 'vitest'
import { EVENTS, canTurnOff, defaultPrefs } from './model'

describe('owner notification prefs', () => {
  it('has a setting for every event', () => {
    const p = defaultPrefs()
    for (const e of EVENTS) expect(p.matrix[e]).toBeDefined()
  })

  it('keeps required alerts on in at least one channel', () => {
    const p = defaultPrefs()
    p.matrix.paymentFailed = { email: true, whatsapp: false, app: false }
    expect(canTurnOff(p, 'paymentFailed', 'email')).toBe(false)
    p.matrix.paymentFailed.app = true
    expect(canTurnOff(p, 'paymentFailed', 'email')).toBe(true)
  })

  it('lets optional alerts be switched off everywhere', () => {
    const p = defaultPrefs()
    p.matrix.hotLead = { email: false, whatsapp: true, app: false }
    expect(canTurnOff(p, 'hotLead', 'whatsapp')).toBe(true)
  })
})
