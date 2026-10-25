import { useSyncExternalStore } from 'react'

/**
 * A tiny client-side store for screens that don't have a backend yet
 * (onboarding, billing, booking, lead capture). State lives in memory and,
 * when `persistKey` is given, in localStorage — so it survives navigation
 * and reloads in this browser only. Swap for Supabase reads when the
 * backend lands; the hooks keep the same shape.
 */
export interface Store<T> {
  get: () => T
  set: (next: T | ((prev: T) => T)) => void
  reset: () => void
  subscribe: (listener: () => void) => () => void
}

export function createStore<T>(initial: () => T, persistKey?: string): Store<T> {
  let state: T | undefined
  const listeners = new Set<() => void>()

  const load = (): T => {
    if (state !== undefined) return state
    state = initial()
    if (persistKey && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(persistKey)
        if (raw) state = { ...state, ...(JSON.parse(raw) as T) }
      } catch {
        // Storage blocked or corrupt: keep the defaults.
      }
    }
    return state
  }

  const save = () => {
    if (!persistKey || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(persistKey, JSON.stringify(state))
    } catch {
      // Private mode / quota: the in-memory copy still works.
    }
  }

  return {
    get: load,
    set(next) {
      state = typeof next === 'function' ? (next as (prev: T) => T)(load()) : next
      save()
      listeners.forEach((l) => l())
    },
    reset() {
      state = initial()
      if (persistKey && typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(persistKey)
        } catch {}
      }
      listeners.forEach((l) => l())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** Subscribe a component to a store. The server snapshot is the initial value. */
export function useStore<T>(store: Store<T>, serverValue: T): T {
  return useSyncExternalStore(store.subscribe, store.get, () => serverValue)
}
