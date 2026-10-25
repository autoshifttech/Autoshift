import { describe, expect, it } from 'vitest'
import { handleRest, parseSelect, type DemoDb } from './rest'
import { createDemoData } from './data'

const BASE = 'https://supabase-not-configured.invalid/rest/v1/'
const get = (db: DemoDb, query: string, headers: Record<string, string> = {}) =>
  handleRest(db, 'GET', new URL(BASE + query), new Headers(headers), null)

describe('parseSelect', () => {
  it('parses aliases, hints and nested embeds', () => {
    expect(parseSelect('id, contact:contacts!fk(name, contact_tags(tags(*)))')).toEqual([
      { name: 'id', alias: null, children: null },
      {
        name: 'contacts',
        alias: 'contact',
        children: [
          { name: 'name', alias: null, children: null },
          { name: 'contact_tags', alias: null, children: [{ name: 'tags', alias: null, children: [{ name: '*', alias: null, children: null }] }] },
        ],
      },
    ])
  })
})

describe('handleRest', () => {
  it('filters, orders and paginates with a count', () => {
    const db = createDemoData()
    const res = get(db, 'conversations?select=*&status=eq.open&order=last_message_at.desc&limit=2', { prefer: 'count=exact' })
    const rows = res.body as { status: string; last_message_at: string }[]
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.status === 'open')).toBe(true)
    expect(rows[0].last_message_at >= rows[1].last_message_at).toBe(true)
    expect(res.headers['content-range']).toMatch(/^0-1\/\d+$/)
  })

  it('embeds parents and children', () => {
    const db = createDemoData()
    const res = get(db, 'conversations?select=*,contact:contacts(*,contact_tags(tags(*)))&limit=1&order=last_message_at.desc')
    const [conv] = res.body as { contact: { name: string; contact_tags: { tags: { name: string } }[] } }[]
    expect(conv.contact.name).toBe('Priya Raman')
    expect(conv.contact.contact_tags.map((ct) => ct.tags.name).sort()).toEqual(['Converted', 'VIP'])
  })

  it('matches profiles by user_id and returns a single object', () => {
    const db = createDemoData()
    const res = get(db, `profiles?select=id,full_name,account_id&user_id=eq.${db.profiles[0].user_id}`, { accept: 'application/vnd.pgrst.object+json' })
    expect(res.status).toBe(200)
    expect((res.body as { full_name: string }).full_name).toBe('Asha Kumar')
    expect(get(db, 'profiles?select=*', { accept: 'application/vnd.pgrst.object+json' }).status).toBe(406)
  })

  it('supports in, ilike and not filters', () => {
    const db = createDemoData()
    expect((get(db, 'contacts?name=ilike.*mehta*').body as unknown[]).length).toBe(1)
    expect((get(db, 'contacts?company=not.is.null').body as unknown[]).length).toBe(5)
    expect((get(db, 'tags?name=in.(VIP,Cold)').body as unknown[]).length).toBe(2)
  })

  it('inserts, updates and deletes in memory', () => {
    const db = createDemoData()
    const created = handleRest(db, 'POST', new URL(BASE + 'tags?select=*'), new Headers({ prefer: 'return=representation' }), JSON.stringify({ name: 'New' }))
    const [tag] = created.body as { id: string; name: string }[]
    expect(created.status).toBe(201)
    handleRest(db, 'PATCH', new URL(BASE + `tags?id=eq.${tag.id}`), new Headers(), JSON.stringify({ name: 'Renamed' }))
    expect(db.tags.find((t) => t.id === tag.id)?.name).toBe('Renamed')
    handleRest(db, 'DELETE', new URL(BASE + `tags?id=eq.${tag.id}`), new Headers(), null)
    expect(db.tags.some((t) => t.id === tag.id)).toBe(false)
  })
})
