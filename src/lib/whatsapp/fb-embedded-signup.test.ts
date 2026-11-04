import { afterEach, describe, expect, it, vi } from 'vitest'
import { embeddedSignupConfig, finishOnServer, parseSignupMessage } from './fb-embedded-signup'

const msg = (event: string, data: Record<string, string> = {}) => JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event, data })

describe('parseSignupMessage', () => {
  it('reads the finished sign-up from facebook.com', () => {
    expect(parseSignupMessage('https://www.facebook.com', msg('FINISH', { waba_id: '22', phone_number_id: '11' }))).toEqual({ kind: 'finish', wabaId: '22', phoneNumberId: '11' })
    expect(parseSignupMessage('https://web.facebook.com', msg('CANCEL', { current_step: 'PHONE_NUMBER_SETUP' }))).toEqual({ kind: 'cancel', step: 'PHONE_NUMBER_SETUP' })
    expect(parseSignupMessage('https://www.facebook.com', msg('ERROR', { error_message: 'Number in use' }))).toEqual({ kind: 'error', message: 'Number in use' })
  })
  it('ignores messages from anywhere else, look-alike hosts and other message types', () => {
    expect(parseSignupMessage('https://evil.example', msg('FINISH', { waba_id: '22', phone_number_id: '11' }))).toBeNull()
    expect(parseSignupMessage('https://facebook.com.evil.example', msg('FINISH', { waba_id: '22', phone_number_id: '11' }))).toBeNull()
    expect(parseSignupMessage('https://www.facebook.com', JSON.stringify({ type: 'OTHER' }))).toBeNull()
    expect(parseSignupMessage('https://www.facebook.com', 'not json')).toBeNull()
  })
  it('a finish without a number is reported, not treated as connected', () => {
    expect(parseSignupMessage('https://www.facebook.com', msg('FINISH_ONLY_WABA', { waba_id: '22' }))).toEqual({ kind: 'finish_without_number', wabaId: '22' })
    expect(parseSignupMessage('https://www.facebook.com', msg('FINISH', { waba_id: '22' }))?.kind).toBe('error')
  })
})

describe('embeddedSignupConfig', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('is off until the app id and configuration id are set', () => {
    expect(embeddedSignupConfig()).toBeNull()
    vi.stubEnv('NEXT_PUBLIC_META_APP_ID', '1871465417362221')
    vi.stubEnv('NEXT_PUBLIC_META_ES_CONFIG_ID', '1126755356785024')
    expect(embeddedSignupConfig()).toEqual({ appId: '1871465417362221', configId: '1126755356785024', version: 'v21.0' })
  })
})

describe('finishOnServer', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('sends the code and ids, and surfaces the server reason on failure', async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ displayPhoneNumber: '+91 1', verifiedName: 'X', registered: true }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    expect(await finishOnServer({ code: 'c', wabaId: '22', phoneNumberId: '11' })).toEqual({ displayPhoneNumber: '+91 1', verifiedName: 'X', registered: true, registrationError: null })
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ code: 'c', waba_id: '22', phone_number_id: '11' })
    f.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'This WhatsApp number is already connected to another AutoShift business' }), { status: 409 }))
    await expect(finishOnServer({ code: 'c', wabaId: '22', phoneNumberId: '11' })).rejects.toThrow(/already connected/)
  })
})
