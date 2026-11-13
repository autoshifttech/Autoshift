import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { automation: unknown[]; direct: string[] } = { automation: [], direct: [] }
let automations: { id: string }[] = []
let logs: { steps_executed: { step_type: string; status: string }[] }[] = []

vi.mock('@/lib/automations/engine', () => ({ runAutomationsForTrigger: async (input: unknown) => void calls.automation.push(input) }))
vi.mock('@/lib/api/v1/contacts', () => ({ resolveAuditUserId: async () => 'owner', findOrCreateContact: async () => ({ id: 'contact-1', created: false }) }))
vi.mock('./phone-otp', () => ({
  getOtpSettings: async () => ({ enabled: true, sender_account_id: 'acc-autoshift', template_name: 'autoshift_otp', language: 'en_US', required_since: null }),
  senderConfig: async () => ({ phone_number_id: 'p', waba_id: 'w', access_token: 't' }),
  sendOtp: async (_c: unknown, _s: unknown, to: string) => void calls.direct.push(to),
}))

import { deliverCode } from './otp-delivery'

function db() {
  const table = (name: string) => {
    const q: Record<string, unknown> = {}
    const chain = () => q
    Object.assign(q, { select: chain, eq: chain, in: chain, gte: chain, then: (r: (v: unknown) => void) => r({ data: name === 'automations' ? automations : logs, error: null }) })
    return q
  }
  return { from: table } as never
}

describe('delivering a one-time code', () => {
  beforeEach(() => {
    calls.automation = []
    calls.direct = []
    automations = []
    logs = []
  })

  it('uses the business automation when it sends the code', async () => {
    automations = [{ id: 'a1' }]
    logs = [{ steps_executed: [{ step_type: 'add_tag', status: 'success' }, { step_type: 'send_verification_code', status: 'success' }] }]
    expect(await deliverCode(db(), '919876543210', '123456', 'phone_verification')).toBe('automation')
    expect(calls.automation).toHaveLength(1)
    expect(calls.automation[0]).toMatchObject({ accountId: 'acc-autoshift', triggerType: 'verification_code_requested', contactId: 'contact-1', context: { otp: { code: '123456' } } })
    expect(calls.direct).toEqual([])
  })

  it('sends directly when the automation did not send it', async () => {
    automations = [{ id: 'a1' }]
    logs = [{ steps_executed: [{ step_type: 'send_verification_code', status: 'failed' }] }]
    expect(await deliverCode(db(), '919876543210', '123456', 'password_reset')).toBe('direct')
    expect(calls.direct).toEqual(['919876543210'])
  })

  it('sends directly when no automation is switched on', async () => {
    expect(await deliverCode(db(), '919876543210', '123456', 'password_change')).toBe('direct')
    expect(calls.automation).toEqual([])
    expect(calls.direct).toEqual(['919876543210'])
  })
})
