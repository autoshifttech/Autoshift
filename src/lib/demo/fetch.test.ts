import { describe, expect, it, vi } from 'vitest'
import { createDemoFetch } from './fetch'

const ORIGIN = 'https://supabase-not-configured.invalid'

describe('createDemoFetch', () => {
  it('answers auth, REST and RPC calls without the network', async () => {
    const real = vi.fn<typeof fetch>()
    const demoFetch = createDemoFetch(ORIGIN, real)
    const user = await (await demoFetch(`${ORIGIN}/auth/v1/user`)).json()
    expect(user.email).toBe('demo@autoshift.app')
    const contacts = await (await demoFetch(`${ORIGIN}/rest/v1/contacts?select=*`)).json()
    expect(contacts.length).toBeGreaterThan(0)
    const overview = await (await demoFetch(`${ORIGIN}/rest/v1/rpc/dashboard_overview`, { method: 'POST', body: JSON.stringify({ p_days: 7, p_tz: 'UTC' }) })).json()
    expect(overview.volume.series).toHaveLength(7)
    expect(real).not.toHaveBeenCalled()
  })

  it('filters contacts by tag through the RPC', async () => {
    const demoFetch = createDemoFetch(ORIGIN, fetch)
    const tags = await (await demoFetch(`${ORIGIN}/rest/v1/tags?select=*&name=eq.VIP`)).json()
    const rows = await (await demoFetch(`${ORIGIN}/rest/v1/rpc/filter_contacts_by_tags`, { method: 'POST', body: JSON.stringify({ p_tag_ids: [tags[0].id], p_limit: 10, p_offset: 0 }) })).json()
    expect(rows.map((r: { contact: { name: string } }) => r.contact.name).sort()).toEqual(['Meena Iyer', 'Priya Raman'])
    expect(rows[0].total_count).toBe(2)
  })

  it('passes other origins through', async () => {
    const real = vi.fn<typeof fetch>(async () => new Response('ok'))
    await createDemoFetch(ORIGIN, real)('https://example.com/x')
    expect(real).toHaveBeenCalledOnce()
  })
})
