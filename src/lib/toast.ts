/**
 * App notifications. The same `toast.success(...)` calls as before, shown by
 * the liquid-glass notification engine in public/liquid-notify.js (a drop
 * falls from the top of the screen, spreads into a glass pill and retracts).
 *
 * The engine is a plain script loaded by <NotificationHost />; calls made
 * before it has loaded are kept and played when it is ready.
 */

interface NotifyAction {
  label: string
  run: () => void
}
interface NotifyOptions {
  title?: string
  letter?: string
  duration?: number
  action?: NotifyAction
}
interface NotifyHandle {
  resolve: (msg: string, o?: { action?: NotifyAction; duration?: number }) => void
  dismiss: () => void
}
export interface NotifyEngine {
  show: (msg: string, o?: NotifyOptions) => NotifyHandle
  loading: (msg: string, o?: NotifyOptions) => NotifyHandle
  dismiss: () => void
  config: (o: Record<string, unknown>) => void
}

export interface ToastOptions {
  description?: unknown
  /** Milliseconds, as before. */
  duration?: number
  id?: string | number
  action?: { label: string; onClick?: () => void }
}

type Kind = 'default' | 'success' | 'error' | 'warning' | 'info'
const LETTER: Record<Kind, string | undefined> = { default: undefined, success: '✓', error: '!', warning: '!', info: 'i' }

const engine = (): NotifyEngine | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { Notify?: NotifyEngine }).Notify)

const waiting: Array<(n: NotifyEngine) => void> = []
const handles = new Map<string | number, NotifyHandle>()
let counter = 0

/** Called once the engine script has loaded. */
export function flushNotifications() {
  const n = engine()
  if (!n) return
  while (waiting.length) waiting.shift()!(n)
}

function run(job: (n: NotifyEngine) => void) {
  const n = engine()
  if (n) job(n)
  else if (typeof window !== 'undefined' && waiting.length < 5) waiting.push(job)
}

const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

function toOptions(kind: Kind, message: string, o: ToastOptions | undefined): { msg: string; opts: NotifyOptions } {
  const description = text(o?.description)
  const opts: NotifyOptions = { letter: LETTER[kind] }
  // With a description, the message becomes the heading and the description the body.
  const msg = description || message
  if (description) opts.title = message
  if (o?.duration && Number.isFinite(o.duration)) opts.duration = o.duration / 1000
  if (o?.action?.onClick) opts.action = { label: o.action.label, run: o.action.onClick }
  return { msg, opts }
}

function emit(kind: Kind, message: unknown, o?: ToastOptions): string | number {
  const id = o?.id ?? ++counter
  const text_ = text(message)
  if (!text_) return id
  const { msg, opts } = toOptions(kind, text_, o)
  const existing = o?.id !== undefined ? handles.get(o.id) : undefined
  if (existing) {
    // Same id as an earlier loading message: it turns into the result in place.
    existing.resolve(msg, { action: opts.action, duration: opts.duration })
    handles.delete(id)
    return id
  }
  run((n) => n.show(msg, opts))
  return id
}

function toast(message: unknown, o?: ToastOptions) {
  return emit('default', message, o)
}
toast.message = toast
toast.success = (message: unknown, o?: ToastOptions) => emit('success', message, o)
toast.error = (message: unknown, o?: ToastOptions) => emit('error', message, o)
toast.warning = (message: unknown, o?: ToastOptions) => emit('warning', message, o)
toast.info = (message: unknown, o?: ToastOptions) => emit('info', message, o)
toast.loading = (message: unknown, o?: ToastOptions) => {
  const id = o?.id ?? ++counter
  const msg = text(message) || 'Working...'
  run((n) => handles.set(id, n.loading(msg, { letter: '…' })))
  return id
}
toast.dismiss = (id?: string | number) => {
  if (id !== undefined && handles.has(id)) {
    handles.get(id)!.dismiss()
    handles.delete(id)
  } else {
    engine()?.dismiss()
  }
}
toast.promise = <T,>(
  promise: Promise<T> | (() => Promise<T>),
  data: { loading?: string; success?: string | ((v: T) => string); error?: string | ((e: unknown) => string) },
) => {
  const id = toast.loading(data.loading ?? 'Working...')
  const p = typeof promise === 'function' ? promise() : promise
  p.then(
    (v) => emit('success', typeof data.success === 'function' ? data.success(v) : (data.success ?? 'Done'), { id }),
    (e) => emit('error', typeof data.error === 'function' ? data.error(e) : (data.error ?? 'Something went wrong'), { id }),
  )
  return { unwrap: () => p }
}

export { toast }
