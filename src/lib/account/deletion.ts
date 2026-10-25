/**
 * Workspace deletion: a request starts a grace period, after which the
 * backend erases the workspace. Kept in the browser until then.
 */
import { createStore, useStore } from '@/lib/workspace/store'

export const GRACE_DAYS = 30

export interface DeletionState {
  scheduledAt: string | null
  /** When the data is erased for good. */
  eraseOn: string | null
  reason: string
}

const empty = (): DeletionState => ({ scheduledAt: null, eraseOn: null, reason: '' })

export const deletionStore = createStore(empty, 'autoshift.workspaceDeletion')
const SERVER = empty()
export const useDeletion = () => useStore(deletionStore, SERVER)

export function scheduleDeletion(reason: string, now = Date.now()) {
  deletionStore.set({ scheduledAt: new Date(now).toISOString(), eraseOn: new Date(now + GRACE_DAYS * 864e5).toISOString(), reason })
}

export const cancelDeletion = () => deletionStore.set(empty())

/** Everything this browser holds for the workspace, as one JSON file. */
export function exportLocalData(): Blob {
  const data: Record<string, unknown> = {}
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      // Workspace data only; the platform admin and website editor are not the business's.
      if (!key || !key.startsWith('autoshift.') || key.startsWith('autoshift.admin') || key.startsWith('autoshift.site')) continue
      const raw = window.localStorage.getItem(key)
      try {
        data[key.slice('autoshift.'.length)] = raw ? JSON.parse(raw) : null
      } catch {
        data[key.slice('autoshift.'.length)] = raw
      }
    }
  } catch {}
  return new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' })
}
