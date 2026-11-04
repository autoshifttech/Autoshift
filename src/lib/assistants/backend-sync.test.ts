import { describe, expect, it, vi } from 'vitest'
import { createStore } from '@/lib/workspace/store'
import { newAssistant, type AssistantsState } from './model'
import { createAssistantsSync, fromRow, toBody, type AssistantRow, type AssistantsApi } from './backend-sync'

function fakeApi(initial: AssistantRow[] = []) {
  const rows = new Map(initial.map((r) => [r.id, r]))
  let n = 0
  const calls: string[] = []
  const api: AssistantsApi = {
    async list() { return [...rows.values()] },
    async create(body) { const r = { ...body, id: `srv-${++n}`, created_at: '2026-01-01T00:00:00Z' }; rows.set(r.id, r); calls.push(`create:${body.name}`); return r },
    async patch(id, body) { const r = { ...rows.get(id)!, ...body }; rows.set(id, r); calls.push(`patch:${id}`); return r },
    async remove(id) { rows.delete(id); calls.push(`remove:${id}`) },
  }
  return { api, rows, calls }
}

const row = (id: string, name: string): AssistantRow => ({ ...toBody({ ...newAssistant('custom', id), name }), id, created_at: '2026-01-01T00:00:00Z' })
const emptyStore = (assistants = [] as AssistantsState['assistants']) => createStore<AssistantsState>(() => ({ assistants, tools: [] }))

describe('assistants backend sync', () => {
  it('replaces the browser sample data with what the server has', async () => {
    const store = emptyStore([newAssistant('sales', 'as-sample')])
    const { api } = fakeApi([row('srv-a', 'From server')])
    await createAssistantsSync(store, api).start()
    expect(store.get().assistants.map((a) => [a.id, a.name])).toEqual([['srv-a', 'From server']])
  })

  it('an empty server means no assistants, not sample data', async () => {
    const store = emptyStore([newAssistant('sales', 'as-sample')])
    await createAssistantsSync(store, fakeApi().api).start()
    expect(store.get().assistants).toEqual([])
  })

  it('creates on the server and swaps in the real id', async () => {
    const store = emptyStore()
    const { api, rows, calls } = fakeApi()
    const sync = createAssistantsSync(store, api, { delayMs: 0 })
    await sync.start()
    store.set((s) => ({ ...s, assistants: [{ ...newAssistant('custom', 'as-123'), name: 'Fresh' }] }))
    await sync.flush()
    await vi.waitFor(() => expect(store.get().assistants[0].id).toBe('srv-1'))
    expect(calls).toEqual(['create:Fresh']) // the id swap is not mistaken for an edit
    expect(rows.get('srv-1')!.name).toBe('Fresh')
  })

  it('sends one update after a burst of edits', async () => {
    const store = emptyStore()
    const { api, calls } = fakeApi([row('srv-a', 'A')])
    const sync = createAssistantsSync(store, api, { delayMs: 10_000 })
    await sync.start()
    for (const name of ['Al', 'Alp', 'Alph', 'Alpha']) store.set((s) => ({ ...s, assistants: s.assistants.map((a) => ({ ...a, name })) }))
    await sync.flush()
    expect(calls).toEqual(['patch:srv-a'])
  })

  it('deletes on the server', async () => {
    const store = emptyStore()
    const { api, rows } = fakeApi([row('srv-a', 'A'), row('srv-b', 'B')])
    await createAssistantsSync(store, api).start()
    store.set((s) => ({ ...s, assistants: s.assistants.filter((a) => a.id !== 'srv-a') }))
    await vi.waitFor(() => expect([...rows.keys()]).toEqual(['srv-b']))
  })

  it('keeps local-only fields and reloads from the server when a save fails', async () => {
    const store = emptyStore()
    const { api, rows } = fakeApi([row('srv-a', 'A')])
    const onError = vi.fn()
    const sync = createAssistantsSync(store, api, { delayMs: 0, onError })
    await sync.start()
    store.set((s) => ({ ...s, assistants: s.assistants.map((a) => ({ ...a, model: 'smart', stats: { replies: 9, handoffs: 1, leads: 2 } })) }))
    expect(store.get().assistants[0].model).toBe('smart') // not sent anywhere, not lost
    api.patch = async () => { throw new Error('boom') }
    store.set((s) => ({ ...s, assistants: s.assistants.map((a) => ({ ...a, name: 'Changed' })) }))
    await sync.flush()
    await vi.waitFor(() => expect(onError).toHaveBeenCalled())
    await vi.waitFor(() => expect(store.get().assistants[0].name).toBe(rows.get('srv-a')!.name)) // back to the server's truth
    expect(store.get().assistants[0].stats.replies).toBe(9)
  })

  it('never sends values the backend would reject', () => {
    const a = { ...newAssistant('custom', 'x'), name: 'n'.repeat(200), color: 'red', provider: undefined, handoff: { onRequest: true, onUnknown: true, maxReplies: 500 } }
    const b = toBody(a)
    expect(b.name).toHaveLength(80)
    expect(b.color).toBe('#1E4C41')
    expect(b.provider).toBe('openai')
    expect(b.handoff.maxReplies).toBe(50)
  })

  it('maps rows back with unknown roles as custom', () => {
    expect(fromRow({ ...row('x', 'X'), role: 'weird' }).role).toBe('custom')
  })
})
