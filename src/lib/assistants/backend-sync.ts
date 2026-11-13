/**
 * Keeps the assistants store in step with the AutoShift backend.
 *
 * Only runs when NEXT_PUBLIC_API_URL is set. Then the server is the source of truth: the list is
 * loaded from it, and every change made in the screens is
 * written back: created, changed (after a short pause so typing isn't one request per key) and deleted.
 * Fields the backend doesn't hold (model tier, reply counters) stay in the browser.
 */
import { assistantsStore, registerAssistantAlias, type Assistant, type AssistantRole, type AssistantsState, type Tool } from './model'
import { createStore, useStore, type Store } from '@/lib/workspace/store'
import { backend, backendUrl } from '@/lib/backend/client'
import { toast } from '@/lib/toast'

export interface AssistantRow {
  id: string
  name: string
  role: string
  color: string
  enabled: boolean
  tone: Assistant['tone']
  instructions: string
  greeting: string
  provider: string
  model_id: string
  knowledge: Assistant['knowledge']
  tool_ids: string[]
  capture_leads: boolean
  audience: Assistant['audience']
  tags: string[]
  handoff: Assistant['handoff']
  created_at?: string
}

export type RowBody = Omit<AssistantRow, 'id' | 'created_at'>

export interface AssistantsApi {
  list(): Promise<AssistantRow[]>
  create(body: RowBody): Promise<AssistantRow>
  patch(id: string, body: Partial<RowBody>): Promise<AssistantRow>
  remove(id: string): Promise<void>
}

export const httpApi: AssistantsApi = {
  list: () => backend<AssistantRow[]>('/v1/assistants'),
  create: (body) => backend<AssistantRow>('/v1/assistants', { method: 'POST', body }),
  patch: (id, body) => backend<AssistantRow>(`/v1/assistants/${id}`, { method: 'PATCH', body }),
  remove: (id) => backend<void>(`/v1/assistants/${id}`, { method: 'DELETE' }),
}

const VENDORS = ['openai', 'google', 'anthropic', 'deepseek', 'deepinfra']

export function toBody(a: Assistant): RowBody {
  return {
    name: a.name.slice(0, 80) || 'Assistant',
    role: a.role,
    color: /^#[0-9A-Fa-f]{6}$/.test(a.color) ? a.color : '#1E4C41',
    enabled: a.enabled,
    tone: a.tone,
    instructions: a.instructions.slice(0, 8000),
    greeting: a.greeting.slice(0, 500),
    provider: a.provider && VENDORS.includes(a.provider) ? a.provider : 'openai',
    model_id: (a.modelId ?? '').slice(0, 120),
    knowledge: a.knowledge.map((f) => ({ q: f.q.slice(0, 300), a: f.a.slice(0, 4000) })),
    tool_ids: a.toolIds,
    capture_leads: a.captureLeads,
    audience: a.audience,
    tags: a.tags,
    handoff: { ...a.handoff, maxReplies: Math.min(50, Math.max(1, a.handoff.maxReplies)) },
  }
}

export function fromRow(row: AssistantRow, local?: Assistant): Assistant {
  return {
    id: row.id,
    name: row.name,
    role: (['sales', 'support', 'custom'].includes(row.role) ? row.role : 'custom') as AssistantRole,
    color: row.color,
    enabled: row.enabled,
    tone: row.tone,
    instructions: row.instructions,
    greeting: row.greeting,
    model: local?.model ?? 'fast',
    provider: row.provider as Assistant['provider'],
    modelId: row.model_id,
    knowledge: row.knowledge,
    toolIds: row.tool_ids,
    captureLeads: row.capture_leads,
    audience: row.audience,
    tags: row.tags,
    handoff: row.handoff,
    stats: local?.stats ?? { replies: 0, handoffs: 0, leads: 0 },
    createdAt: row.created_at ?? local?.createdAt ?? new Date().toISOString(),
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function createAssistantsSync(store: Store<AssistantsState>, api: AssistantsApi, opts: { delayMs?: number; onError?: (e: unknown) => void } = {}) {
  const delay = opts.delayMs ?? 600
  const known = new Map<string, RowBody>() // what the server has, by id
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const inflight = new Set<string>()
  let applying = false
  let started: Promise<void> | null = null
  let off: (() => void) | null = null

  const apply = (fn: () => void) => {
    applying = true
    try {
      fn()
    } finally {
      applying = false
    }
  }

  const fail = (e: unknown) => {
    opts.onError?.(e)
    void resync()
  }

  async function resync() {
    const rows = await api.list()
    apply(() =>
      store.set((s) => ({
        ...s,
        assistants: rows.map((r) => fromRow(r, s.assistants.find((x) => x.id === r.id))),
      })),
    )
    known.clear()
    for (const r of rows) known.set(r.id, toBody(fromRow(r)))
  }

  async function push(id: string) {
    timers.delete(id)
    const a = store.get().assistants.find((x) => x.id === id)
    if (!a || inflight.has(id)) return
    const body = toBody(a)
    inflight.add(id)
    try {
      if (!known.has(id)) {
        const made = await api.create(body)
        known.set(made.id, body)
        // The server chose the real id; swap it in without it counting as an edit.
        registerAssistantAlias(id, made.id)
        apply(() => store.set((s) => ({ ...s, assistants: s.assistants.map((x) => (x.id === id ? { ...x, id: made.id, createdAt: made.created_at ?? x.createdAt } : x)) })))
      } else if (!same(known.get(id), body)) {
        await api.patch(id, body)
        known.set(id, body)
      }
    } catch (e) {
      fail(e)
    } finally {
      inflight.delete(id)
    }
  }

  function onChange() {
    if (applying) return
    const now = store.get().assistants
    const ids = new Set(now.map((a) => a.id))
    for (const id of [...known.keys()]) {
      if (!ids.has(id)) {
        known.delete(id)
        void api.remove(id).catch(fail)
      }
    }
    for (const a of now) {
      if (known.has(a.id) && same(known.get(a.id), toBody(a))) continue
      clearTimeout(timers.get(a.id))
      timers.set(a.id, setTimeout(() => void push(a.id), known.has(a.id) ? delay : 0))
    }
  }

  return {
    /** Loads from the server, then starts writing changes back. Safe to call many times. */
    start(): Promise<void> {
      started ??= resync().then(() => {
        off = store.subscribe(onChange)
      })
      started.catch(() => (started = null))
      return started
    },
    stop() {
      off?.()
      timers.forEach(clearTimeout)
      timers.clear()
      started = null
    },
    /** Sends any waiting edits now (used before leaving the page and in tests). */
    async flush() {
      for (const id of [...timers.keys()]) {
        clearTimeout(timers.get(id))
        await push(id)
      }
    },
  }
}

export type SyncStatus = 'off' | 'loading' | 'ready' | 'error'
const statusStore = createStore<SyncStatus>(() => (backendUrl() ? 'loading' : 'off'))
const SERVER_STATUS: SyncStatus = 'off'
/** 'off' without a backend; otherwise whether the server's list has arrived. */
export const useAssistantsSyncStatus = () => useStore(statusStore, SERVER_STATUS)

// ------------------------------------------------------------------ tools

export interface ToolRow {
  key: string
  builtin: boolean
  category: Tool['category']
  name: string
  description: string
  enabled: boolean
  webhook: Tool['webhook'] | null
  calls: number
}
type ToolBody = Pick<ToolRow, 'name' | 'description' | 'enabled'> & { webhook?: Tool['webhook'] }

export interface ToolsApi {
  list(): Promise<ToolRow[]>
  create(body: ToolBody): Promise<ToolRow>
  patch(key: string, body: Partial<ToolBody>): Promise<ToolRow>
  remove(key: string): Promise<void>
}

export const toolsHttpApi: ToolsApi = {
  list: () => backend<ToolRow[]>('/v1/tools'),
  create: (body) => backend<ToolRow>('/v1/tools', { method: 'POST', body }),
  patch: (key, body) => backend<ToolRow>(`/v1/tools/${key}`, { method: 'PATCH', body }),
  remove: (key) => backend<void>(`/v1/tools/${key}`, { method: 'DELETE' }),
}

export const toolFromRow = (r: ToolRow): Tool => ({ id: r.key, builtin: r.builtin, category: r.category, name: r.name, description: r.description, enabled: r.enabled, webhook: r.webhook ?? undefined, calls: r.calls })
/** What the server is told: built-ins only switch on or off. */
export const toolBody = (t: Tool): ToolBody => (t.builtin ? { name: t.name, description: t.description, enabled: t.enabled } : { name: t.name, description: t.description, enabled: t.enabled, webhook: t.webhook })

export function createToolsSync(store: Store<AssistantsState>, api: ToolsApi, opts: { onError?: (e: unknown) => void } = {}) {
  const known = new Map<string, ToolBody>()
  let applying = false
  let off: (() => void) | null = null
  const apply = (fn: () => void) => {
    applying = true
    try {
      fn()
    } finally {
      applying = false
    }
  }
  async function resync() {
    const rows = await api.list()
    apply(() => store.set((s) => ({ ...s, tools: rows.map((r) => toolFromRow(r)) })))
    known.clear()
    for (const r of rows) known.set(r.key, toolBody(toolFromRow(r)))
  }
  const fail = (e: unknown) => {
    opts.onError?.(e)
    void resync().catch(() => {})
  }
  async function push(t: Tool) {
    try {
      if (!known.has(t.id)) {
        if (t.builtin) return
        known.set(t.id, toolBody(t)) // so a burst of changes doesn't create it twice
        const made = await api.create(toolBody(t))
        known.delete(t.id)
        known.set(made.key, toolBody(toolFromRow(made)))
        // swap the server's key in, everywhere the local id was used
        store.set((s) => ({
          tools: s.tools.map((x) => (x.id === t.id ? { ...x, id: made.key } : x)),
          assistants: s.assistants.map((a) => (a.toolIds.includes(t.id) ? { ...a, toolIds: a.toolIds.map((k) => (k === t.id ? made.key : k)) } : a)),
        }))
      } else if (!same(known.get(t.id), toolBody(t))) {
        known.set(t.id, toolBody(t))
        await api.patch(t.id, t.builtin ? { enabled: t.enabled } : toolBody(t))
      }
    } catch (e) {
      fail(e)
    }
  }
  function onChange() {
    if (applying) return
    const now = store.get().tools
    for (const id of [...known.keys()]) {
      if (!now.some((t) => t.id === id)) {
        known.delete(id)
        void api.remove(id).catch(fail)
      }
    }
    for (const t of now) if (!known.has(t.id) || !same(known.get(t.id), toolBody(t))) void push(t)
  }
  let started: Promise<void> | null = null
  return {
    start(): Promise<void> {
      started ??= resync().then(() => {
        off = store.subscribe(onChange)
      })
      started.catch(() => (started = null))
      return started
    },
    stop() {
      off?.()
      started = null
    },
  }
}

let sharedTools: ReturnType<typeof createToolsSync> | null = null

let shared: ReturnType<typeof createAssistantsSync> | null = null

/** The app's one sync, or null when the backend isn't connected. */
export function assistantsSync() {
  if (!backendUrl()) return null
  shared ??= createAssistantsSync(assistantsStore, httpApi, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save to the server. Reloading your assistants.') })
  return shared
}

/** Starts the sync (once) and reports its status. Call from the assistants screens. */
export function startAssistantsSync() {
  const sync = assistantsSync()
  if (!sync) return
  sharedTools ??= createToolsSync(assistantsStore, toolsHttpApi, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save the tool. Reloading your tools.') })
  void sharedTools.start().catch(() => {})
  statusStore.set('loading')
  sync.start().then(
    () => statusStore.set('ready'),
    () => {
      statusStore.set('error')
      toast.error('Could not load your assistants from the server.')
    },
  )
}
