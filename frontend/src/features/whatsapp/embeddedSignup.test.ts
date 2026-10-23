import { describe, expect, it } from 'vitest'
import { isFacebookOrigin, parseSignupMessage } from './embeddedSignup'

const FB = 'https://www.facebook.com'
const msg = (event: string, data: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event, data })

describe('isFacebookOrigin', () => {
  it('accepts facebook.com and subdomains over https only', () => {
    expect(isFacebookOrigin('https://facebook.com')).toBe(true)
    expect(isFacebookOrigin('https://web.facebook.com')).toBe(true)
    expect(isFacebookOrigin('http://www.facebook.com')).toBe(false)
    expect(isFacebookOrigin('https://evilfacebook.com')).toBe(false)
    expect(isFacebookOrigin('https://facebook.com.evil.io')).toBe(false)
    expect(isFacebookOrigin('null')).toBe(false)
  })
})

describe('parseSignupMessage', () => {
  it('reads the WABA and phone number IDs on FINISH', () => {
    expect(parseSignupMessage(FB, msg('FINISH', { waba_id: '111', phone_number_id: '222' }))).toEqual({
      kind: 'finish',
      wabaId: '111',
      phoneNumberId: '222',
      onboardingType: 'cloud',
    })
  })

  it('flags coexistence onboarding', () => {
    const parsed = parseSignupMessage(
      FB,
      msg('FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', { waba_id: '1', phone_number_id: '2' }),
    )
    expect(parsed).toMatchObject({ kind: 'finish', onboardingType: 'coexistence' })
  })

  it('reports cancel steps and errors', () => {
    expect(parseSignupMessage(FB, msg('CANCEL', { current_step: 'PHONE_NUMBER_SETUP' }))).toEqual({
      kind: 'cancel',
      step: 'PHONE_NUMBER_SETUP',
    })
    expect(parseSignupMessage(FB, msg('ERROR', { error_message: 'boom' }))).toEqual({ kind: 'error', message: 'boom' })
    expect(parseSignupMessage(FB, msg('FINISH_ONLY_WABA', { waba_id: '1' }))).toMatchObject({ kind: 'error' })
    expect(parseSignupMessage(FB, msg('FINISH', { waba_id: '1' }))).toMatchObject({ kind: 'error' })
  })

  it('ignores other origins, other message types and junk', () => {
    expect(parseSignupMessage('https://example.com', msg('FINISH', { waba_id: '1', phone_number_id: '2' }))).toBeNull()
    expect(parseSignupMessage(FB, JSON.stringify({ type: 'OTHER' }))).toBeNull()
    expect(parseSignupMessage(FB, 'not json')).toBeNull()
    expect(parseSignupMessage(FB, { type: 'WA_EMBEDDED_SIGNUP', event: 'UNKNOWN' })).toBeNull()
  })
})
