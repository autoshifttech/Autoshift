import { describe, expect, it, vi } from 'vitest'
import { completeEmbeddedSignup, type EmbeddedSignupDeps } from './embedded-signup'

function deps(over: Partial<EmbeddedSignupDeps> = {}): EmbeddedSignupDeps & { saved: unknown[] } {
  const saved: unknown[] = []
  return {
    saved,
    exchangeCode: vi.fn().mockResolvedValue('business-token'),
    listWabaNumbers: vi.fn().mockResolvedValue([{ id: '111111' }]),
    readNumber: vi.fn().mockResolvedValue({ display_phone_number: '+91 98765 43210', verified_name: 'Olive & Thread' }),
    subscribeWaba: vi.fn().mockResolvedValue(undefined),
    registerNumber: vi.fn().mockResolvedValue(undefined),
    linkedToAnotherBusiness: vi.fn().mockResolvedValue(false),
    save: vi.fn(async (row) => void saved.push(row)),
    operatingToken: (t) => t,
    randomPin: () => '482910',
    ...over,
  }
}
const input = { code: 'one-time-code', wabaId: '222222', phoneNumberId: '111111' }

describe('completeEmbeddedSignup', () => {
  it('connects the number: exchange, check, subscribe, register, save', async () => {
    const d = deps()
    const out = await completeEmbeddedSignup(d, input)
    expect(out).toEqual({ ok: true, displayPhoneNumber: '+91 98765 43210', verifiedName: 'Olive & Thread', registered: true, registrationError: null })
    expect(d.subscribeWaba).toHaveBeenCalledWith('222222', 'business-token')
    expect(d.registerNumber).toHaveBeenCalledWith('111111', 'business-token', '482910')
    expect(d.saved).toEqual([{ phoneNumberId: '111111', wabaId: '222222', token: 'business-token', pin: '482910', registered: true, registrationError: null }])
  })

  it("uses the platform's own system-user token when one is set", async () => {
    const d = deps({ operatingToken: () => 'platform-system-user-token' })
    await completeEmbeddedSignup(d, input)
    expect(d.subscribeWaba).toHaveBeenCalledWith('222222', 'platform-system-user-token')
    expect((d.saved[0] as { token: string }).token).toBe('platform-system-user-token')
  })

  it('refuses bad input before calling Meta', async () => {
    const d = deps()
    const out = await completeEmbeddedSignup(d, { ...input, wabaId: 'abc' })
    expect(out).toMatchObject({ ok: false, step: 'input', status: 400 })
    expect(d.exchangeCode).not.toHaveBeenCalled()
  })

  it('stops when the code exchange fails, and saves nothing', async () => {
    const d = deps({ exchangeCode: vi.fn().mockRejectedValue(new Error('code expired')) })
    expect(await completeEmbeddedSignup(d, input)).toMatchObject({ ok: false, step: 'exchange_code', status: 502 })
    expect(d.saved).toEqual([])
  })

  it('refuses a number that is not in the chosen account', async () => {
    const d = deps({ listWabaNumbers: vi.fn().mockResolvedValue([{ id: '999999' }]) })
    expect(await completeEmbeddedSignup(d, input)).toMatchObject({ ok: false, step: 'waba_phone_numbers', status: 400 })
    expect(d.subscribeWaba).not.toHaveBeenCalled()
  })

  it('refuses a number already connected to another business', async () => {
    const d = deps({ linkedToAnotherBusiness: vi.fn().mockResolvedValue(true) })
    expect(await completeEmbeddedSignup(d, input)).toMatchObject({ ok: false, step: 'conflict', status: 409 })
    expect(d.saved).toEqual([])
  })

  it('still saves the connection when registration fails, so it can be retried', async () => {
    const d = deps({ registerNumber: vi.fn().mockRejectedValue(new Error('PIN mismatch')) })
    const out = await completeEmbeddedSignup(d, input)
    expect(out).toMatchObject({ ok: true, registered: false, registrationError: 'PIN mismatch' })
    expect(d.saved[0]).toMatchObject({ registered: false, registrationError: 'PIN mismatch' })
  })

  it('stops without saving when subscribing the account fails', async () => {
    const d = deps({ subscribeWaba: vi.fn().mockRejectedValue(new Error('no permission')) })
    expect(await completeEmbeddedSignup(d, input)).toMatchObject({ ok: false, step: 'subscribe_waba' })
    expect(d.saved).toEqual([])
  })
})
