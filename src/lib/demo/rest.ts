/**
 * A small in-memory stand-in for Supabase's REST API (PostgREST), used only
 * by demo mode. It understands the subset the CRM screens use: column
 * filters, ordering, limit/offset, single-row reads, counts, embedded
 * relations (`contact:contacts(name)`, `contact_tags(tag:tags(*))`) and
 * insert/update/delete. Rows live in memory for the life of the tab.
 */

export type Row = Record<string, unknown>
export type DemoDb = Record<string, Row[]>
export type DemoResponse = { status: number; headers: Record<string, string>; body: unknown }

type SelectItem = { name: string; alias: string | null; children: SelectItem[] | null }

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

/** Splits on top-level commas (ignoring commas inside parentheses). */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += char
  }
  if (current.trim()) parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

export function parseSelect(select: string): SelectItem[] {
  return splitTopLevel(select.replace(/\s+/g, '')).map((item) => {
    const open = item.indexOf('(')
    const head = open === -1 ? item : item.slice(0, open)
    const children = open === -1 ? null : parseSelect(item.slice(open + 1, item.lastIndexOf(')')))
    const [first, second] = head.split(':')
    const alias = second !== undefined ? first : null
    const name = (second ?? first).split('!')[0]
    return { name, alias, children }
  })
}

function singular(table: string): string {
  if (table.endsWith('ies')) return `${table.slice(0, -3)}y`
  return table.endsWith('s') ? table.slice(0, -1) : table
}

function embed(db: DemoDb, table: string, row: Row, item: SelectItem): unknown {
  const target = db[item.name] ?? []
  const key = item.alias ?? item.name
  // Parent relation: this row carries the foreign key (contact_id → contacts).
  for (const fk of [`${key}_id`, `${singular(item.name)}_id`]) {
    if (fk in row) {
      const id = row[fk]
      const match = target.find((r) => r.id === id || (item.name === 'profiles' && r.user_id === id))
      return match ? project(db, item.name, match, item.children!) : null
    }
  }
  // Child relation: the other table points at this row (contact_tags.contact_id).
  const back = `${singular(table)}_id`
  return target.filter((r) => r[back] === row.id).map((r) => project(db, item.name, r, item.children!))
}

function project(db: DemoDb, table: string, row: Row, items: SelectItem[]): Row {
  const out: Row = { ...row }
  for (const item of items) {
    if (item.children) out[item.alias ?? item.name] = embed(db, table, row, item)
    else if (item.alias && item.name !== '*') out[item.alias] = row[item.name]
  }
  return out
}

function parseValue(raw: string): unknown {
  if (raw === 'null') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  return raw
}

function matches(row: Row, column: string, expr: string): boolean {
  const negate = expr.startsWith('not.')
  const body = negate ? expr.slice(4) : expr
  const dot = body.indexOf('.')
  const op = body.slice(0, dot)
  const raw = decodeURIComponent(body.slice(dot + 1))
  const value = row[column]
  let result: boolean
  switch (op) {
    case 'eq':
      result = String(value) === raw
      break
    case 'neq':
      result = String(value) !== raw
      break
    case 'is':
      result = value === parseValue(raw) || (raw === 'null' && value === undefined)
      break
    case 'in': {
      const list = raw.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''))
      result = list.includes(String(value))
      break
    }
    case 'gt':
      result = String(value) > raw
      break
    case 'gte':
      result = String(value) >= raw
      break
    case 'lt':
      result = String(value) < raw
      break
    case 'lte':
      result = String(value) <= raw
      break
    case 'like':
    case 'ilike': {
      const pattern = new RegExp(`^${raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*')}$`, op === 'ilike' ? 'i' : '')
      result = pattern.test(String(value ?? ''))
      break
    }
    case 'cs':
      result = Array.isArray(value) && raw.replace(/^\{|\}$/g, '').split(',').every((v) => (value as unknown[]).map(String).includes(v))
      break
    default:
      result = true // unsupported operator: don't filter
  }
  return negate ? !result : result
}

function filterRows(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows
  params.forEach((expr, column) => {
    if (RESERVED.has(column) || column.includes('.') || column === 'or' || column === 'and') return
    out = out.filter((row) => matches(row, column, expr))
  })
  return out
}

function sortRows(rows: Row[], order: string | null): Row[] {
  if (!order) return rows
  const keys = order.split(',').map((part) => {
    const [column, dir = 'asc'] = part.split('.')
    return { column, desc: dir === 'desc' }
  })
  return [...rows].sort((a, b) => {
    for (const { column, desc } of keys) {
      const av = a[column]
      const bv = b[column]
      if (av === bv) continue
      if (av === undefined || av === null) return 1
      if (bv === undefined || bv === null) return -1
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return desc ? -cmp : cmp
    }
    return 0
  })
}

let counter = 0
function newId(): string {
  counter++
  const hex = (Date.now().toString(16) + counter.toString(16).padStart(6, '0')).slice(-12).padStart(12, '0')
  return `de300000-0000-4000-8000-${hex}`
}

export function handleRest(
  db: DemoDb,
  method: string,
  url: URL,
  headers: Headers,
  rawBody: string | null,
): DemoResponse {
  const table = decodeURIComponent(url.pathname.replace(/^.*\/rest\/v1\//, ''))
  const params = url.searchParams
  const wantsObject = (headers.get('accept') ?? '').includes('vnd.pgrst.object')
  const prefer = headers.get('prefer') ?? ''
  const json = (status: number, body: unknown, extra: Record<string, string> = {}): DemoResponse => ({
    status,
    headers: { 'content-type': 'application/json', ...extra },
    body,
  })

  db[table] ??= []
  const select = params.get('select')
  const items = select ? parseSelect(select) : []
  const shape = (rows: Row[]) => rows.map((row) => project(db, table, row, items))

  if (method === 'GET' || method === 'HEAD') {
    const all = sortRows(filterRows(db[table], params), params.get('order'))
    const offset = Number(params.get('offset') ?? 0)
    const limit = params.has('limit') ? Number(params.get('limit')) : all.length
    const page = all.slice(offset, offset + limit)
    const range = { 'content-range': page.length ? `${offset}-${offset + page.length - 1}/${all.length}` : `*/${all.length}` }
    if (method === 'HEAD') return { status: 200, headers: range, body: null }
    if (wantsObject) {
      if (page.length !== 1) {
        return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${page.length} rows`, hint: null })
      }
      return json(200, shape(page)[0], range)
    }
    return json(200, shape(page), prefer.includes('count=') ? range : {})
  }

  const body = rawBody ? (JSON.parse(rawBody) as Row | Row[]) : {}
  const returnRows = prefer.includes('return=representation')
  const respond = (rows: Row[], status: number) =>
    returnRows ? json(status, wantsObject ? (shape(rows)[0] ?? null) : shape(rows)) : { status: 204, headers: {}, body: null }

  if (method === 'POST') {
    const now = new Date().toISOString()
    const incoming = Array.isArray(body) ? body : [body]
    const merge = prefer.includes('resolution=merge-duplicates')
    const conflictKeys = (params.get('on_conflict') ?? 'id').split(',')
    const written: Row[] = []
    for (const input of incoming) {
      const existing = merge
        ? db[table].find((r) => conflictKeys.every((k) => input[k] !== undefined && r[k] === input[k]))
        : undefined
      if (existing) {
        Object.assign(existing, input, { updated_at: now })
        written.push(existing)
      } else {
        const row: Row = { id: newId(), created_at: now, updated_at: now, ...input }
        db[table].push(row)
        written.push(row)
      }
    }
    return respond(written, 201)
  }

  if (method === 'PATCH') {
    const rows = filterRows(db[table], params)
    for (const row of rows) Object.assign(row, body, { updated_at: new Date().toISOString() })
    return respond(rows, 200)
  }

  if (method === 'DELETE') {
    const rows = filterRows(db[table], params)
    db[table] = db[table].filter((row) => !rows.includes(row))
    return respond(rows, 200)
  }

  return json(405, { message: `Method ${method} not supported in demo mode` })
}
