import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../../lib/api'

export type Role = 'owner' | 'admin' | 'agent'
export type Tenant = { id: string; name: string; role: Role; created_at: string }

type WorkspaceState = {
  tenants: Tenant[]
  current: Tenant | null
  loading: boolean
  error: string | null
  select: (id: string) => void
  create: (name: string) => Promise<void>
  reload: () => Promise<void>
}

const STORAGE_KEY = 'autoshift.tenant'
const WorkspaceContext = createContext<WorkspaceState | null>(null)

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [currentId, setCurrentId] = useState<string | null>(readStored)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTenants(await api<Tenant[]>('/api/tenants'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load workspaces')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial load from the API; state updates happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  const select = (id: string) => {
    setCurrentId(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* storage unavailable: selection lasts for this session only */
    }
  }

  const create = async (name: string) => {
    const tenant = await api<Tenant>('/api/tenants', { method: 'POST', body: { name } })
    setTenants((list) => [...list, tenant])
    select(tenant.id)
  }

  const current = tenants.find((t) => t.id === currentId) ?? tenants[0] ?? null

  return (
    <WorkspaceContext.Provider value={{ tenants, current, loading, error, select, create, reload }}>{children}</WorkspaceContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace(): WorkspaceState {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return value
}
