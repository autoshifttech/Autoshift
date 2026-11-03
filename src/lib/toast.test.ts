import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { flushNotifications, toast, type NotifyEngine } from './toast'

const handle = () => ({ resolve: vi.fn(), dismiss: vi.fn() })
let engine: { show: ReturnType<typeof vi.fn>; loading: ReturnType<typeof vi.fn>; dismiss: ReturnType<typeof vi.fn>; config: ReturnType<typeof vi.fn> }

beforeEach(() => {
  engine = { show: vi.fn(() => handle()), loading: vi.fn(() => handle()), dismiss: vi.fn(), config: vi.fn() }
  ;(globalThis as { window?: unknown }).window = { Notify: engine as unknown as NotifyEngine }
})
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe('toast', () => {
  it('shows the message with a letter for its kind', () => {
    toast.success('Saved')
    toast.error('Failed')
    expect(engine.show).toHaveBeenNthCalledWith(1, 'Saved', { letter: '✓' })
    expect(engine.show).toHaveBeenNthCalledWith(2, 'Failed', { letter: '!' })
  })

  it('uses the message as the heading when there is a description, and converts the duration to seconds', () => {
    toast.error('Could not save', { description: 'Check the connection', duration: 10000 })
    expect(engine.show).toHaveBeenCalledWith('Check the connection', { letter: '!', title: 'Could not save', duration: 10 })
  })

  it('passes an action through', () => {
    const onClick = vi.fn()
    toast('Day reset', { action: { label: 'Undo', onClick } })
    const opts = engine.show.mock.calls[0][1] as { action: { label: string; run: () => void } }
    expect(opts.action.label).toBe('Undo')
    opts.action.run()
    expect(onClick).toHaveBeenCalled()
  })

  it('ignores empty messages', () => {
    toast.info('')
    expect(engine.show).not.toHaveBeenCalled()
  })

  it('turns a loading message into the result when the same id is used', () => {
    const h = handle()
    engine.loading.mockReturnValue(h)
    const id = toast.loading('Updating…')
    toast.success('Updated', { id })
    expect(h.resolve).toHaveBeenCalledWith('Updated', { action: undefined, duration: undefined })
  })

  it('keeps messages until the engine has loaded', () => {
    delete (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = {}
    toast.success('Early')
    expect(engine.show).not.toHaveBeenCalled()
    ;(globalThis as { window: { Notify?: unknown } }).window.Notify = engine
    flushNotifications()
    expect(engine.show).toHaveBeenCalledWith('Early', { letter: '✓' })
  })
})
