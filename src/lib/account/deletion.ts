/**
 * Workspace deletion: a request starts a grace period, after which the
 * backend erases the workspace. Kept in the browser until then.
 */
import { createStore, useStore } from '@/lib/workspace/store'
import { backend, backendUrl } from '@/lib/backend/client'

export const GRACE_DAYS = 30

export interface DeletionState {
  scheduledAt: string | null
  /** When the data is erased for good. */
  eraseOn: string | null
  reason: string
}

const empty = (): DeletionState => ({ scheduledAt: null, eraseOn: null, reason: '' })

export const deletionStore = createStore(empty, backendUrl() ? undefined : 'autoshift.workspaceDeletion')
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

// ------------------------------------------------------------- backend
// Connected, the server holds the request and deletes the business when the grace period ends
// (money records are kept by law; everything else goes).

interface CloseRequestRow {
  close_after: string | null
  reason: string
}
const fromRow = (r: CloseRequestRow): DeletionState => ({ scheduledAt: r.close_after ? new Date(new Date(r.close_after).getTime() - GRACE_DAYS * 864e5).toISOString() : null, eraseOn: r.close_after, reason: r.reason })

/** The business name the server will check, so the owner types the right one. */
export async function loadDeletion(): Promise<string | null> {
  if (!backendUrl()) return null
  const [req, me] = await Promise.all([backend<CloseRequestRow>('/v1/account/close-request'), backend<{ account_name: string }>('/v1/me')])
  deletionStore.set(fromRow(req))
  return me.account_name
}

export async function requestDeletion(reason: string, confirmName: string): Promise<void> {
  if (!backendUrl()) return scheduleDeletion(reason)
  deletionStore.set(fromRow(await backend<CloseRequestRow>('/v1/account/close-request', { method: 'POST', body: { confirm_name: confirmName, reason } })))
}

export async function withdrawDeletion(): Promise<void> {
  if (!backendUrl()) return cancelDeletion()
  deletionStore.set(fromRow(await backend<CloseRequestRow>('/v1/account/close-request', { method: 'DELETE' })))
}
