import { afterEach, describe, expect, it, vi } from 'vitest'
import { billableCategory, chargeBilledMessage, forwardEvent } from './internal'

describe('billableCategory', () => {
  it('maps Meta pricing to our charge categories', () => {
    expect(billableCategory({ billable: true, category: 'marketing' })).toBe('marketing')
    expect(billableCategory({ billable: true, category: 'marketing_lite' })).toBe('marketing')
    expect(billableCategory({ billable: true, category: 'authentication_international' })).toBe('authentication')
    expect(billableCategory({ billable: true, category: 'utility' })).toBe('utility')
  })
  it('free or unknown messages are not charged', () => {
    expect(billableCategory({ billable: false, category: 'marketing' })).toBeNull()
    expect(billableCategory({ billable: true, category: 'referral_conversion' })).toBeNull()
    expect(billableCategory(undefined)).toBeNull()
  })
})

describe('backend calls', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })
  it('do nothing until configured', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    await chargeBilledMessage('a', 'wamid.1', 'marketing')
    expect(f).not.toHaveBeenCalled()
  })
  it('send the shared secret and an idempotency key per message, and never throw', async () => {
    vi.stubEnv('AUTOSHIFT_API_URL', 'https://api.example.com/')
    vi.stubEnv('AUTOSHIFT_INTERNAL_SECRET', 's3cret')
    const f = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', f)
    await chargeBilledMessage('acct', 'wamid.9', 'utility')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.example.com/v1/internal/charge')
    expect(init.headers['X-AutoShift-Internal']).toBe('s3cret')
    expect(JSON.parse(init.body)).toMatchObject({ account_id: 'acct', category: 'utility', idempotency_key: 'msg:wamid.9' })
    f.mockRejectedValueOnce(new Error('down'))
    await expect(forwardEvent('acct', 'message.received', {})).resolves.toBeUndefined()
  })
})
