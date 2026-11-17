// ============================================================
// Shifty's settings for the signed-in person: how lively he is, whether he makes sounds, and which
// tours and page tips they've already seen. Saved on their profile (profiles.shifty, migration 084)
// so it follows them to every device, with a local copy so he appears without waiting.
// ============================================================

import { useEffect } from 'react'
import { createStore, useStore } from '@/lib/workspace/store'
import { createClient } from '@/lib/supabase/client'
import { isLive } from '@/lib/workspace/live'

export type ShiftyMode = 'lively' | 'calm' | 'off'

export interface ShiftyPrefs {
  mode: ShiftyMode
  sound: boolean
  /** Tours and page tips already seen: "welcome", "page:/flows", "admin". */
  seen: Record<string, true>
}

export const DEFAULT_PREFS: ShiftyPrefs = { mode: 'calm', sound: false, seen: {} }
const LOCAL = 'autoshift-shifty'

export function normalizePrefs(raw: unknown): ShiftyPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ShiftyPrefs>
  const mode: ShiftyMode = r.mode === 'lively' || r.mode === 'off' ? r.mode : 'calm'
  const seen: Record<string, true> = {}
  if (r.seen && typeof r.seen === 'object') for (const [k, v] of Object.entries(r.seen)) if (v) seen[k] = true
  return { mode, sound: r.sound === true, seen }
}

function readLocal(): ShiftyPrefs {
  try {
    return normalizePrefs(JSON.parse(localStorage.getItem(LOCAL) || '{}'))
  } catch {
    return DEFAULT_PREFS
  }
}

export const shiftyStore = createStore<{ prefs: ShiftyPrefs; loaded: boolean }>(() => ({ prefs: DEFAULT_PREFS, loaded: false }))
const SERVER = { prefs: DEFAULT_PREFS, loaded: false }
let loading: Promise<void> | null = null

export function loadShiftyPrefs(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    shiftyStore.set({ prefs: readLocal(), loaded: !isLive() })
    if (!isLive()) return
    const sb = createClient()
    const { data: auth } = await sb.auth.getUser()
    if (!auth.user) return shiftyStore.set((s) => ({ ...s, loaded: true }))
    const { data } = await sb.from('profiles').select('shifty').eq('user_id', auth.user.id).maybeSingle()
    // Before migration 084 the column doesn't exist: keep the local copy.
    const prefs = data && 'shifty' in data ? normalizePrefs({ ...readLocal(), ...(data.shifty as object) }) : readLocal()
    try { localStorage.setItem(LOCAL, JSON.stringify(prefs)) } catch {}
    shiftyStore.set({ prefs, loaded: true })
  })().catch(() => shiftyStore.set((s) => ({ ...s, loaded: true })))
  return loading
}

export function useShiftyPrefs() {
  useEffect(() => {
    void loadShiftyPrefs()
  }, [])
  return useStore(shiftyStore, SERVER)
}

/** Change Shifty's settings (saved locally at once, then on the profile). */
export async function saveShiftyPrefs(patch: Partial<ShiftyPrefs>): Promise<void> {
  const prefs = normalizePrefs({ ...shiftyStore.get().prefs, ...patch, seen: { ...shiftyStore.get().prefs.seen, ...(patch.seen ?? {}) } })
  if (patch.seen && Object.keys(patch.seen).length === 0) prefs.seen = {}
  shiftyStore.set((s) => ({ ...s, prefs }))
  try { localStorage.setItem(LOCAL, JSON.stringify(prefs)) } catch {}
  if (!isLive()) return
  const sb = createClient()
  const { data: auth } = await sb.auth.getUser()
  if (!auth.user) return
  await sb.from('profiles').update({ shifty: prefs }).eq('user_id', auth.user.id)
}

export const markSeen = (key: string) => saveShiftyPrefs({ seen: { [key]: true } })
