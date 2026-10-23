import { Inbox, Loader2, LogOut, MessageCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { Logo } from '../../components/Logo'
import { brand } from '../../content/brand'
import { useAuth } from '../../features/auth/AuthProvider'
import { useWorkspace, WorkspaceProvider } from '../../features/workspace/WorkspaceProvider'
import { cn } from '../../lib/cn'

const nav = [
  { to: '/app', label: 'Inbox', icon: Inbox, end: true },
  { to: '/app/settings/whatsapp', label: 'WhatsApp', icon: MessageCircle, end: false },
]

function CreateWorkspace() {
  const { create } = useWorkspace()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError('Give your workspace a name.')
    setBusy(true)
    try {
      await create(name.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the workspace')
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-surface px-4">
      <form onSubmit={submit} noValidate className="card w-full max-w-md space-y-5 p-6 sm:p-8">
        <Logo />
        <div>
          <h1 className="text-xl font-bold">Create your workspace</h1>
          <p className="mt-1 text-sm text-ink-soft">A workspace holds your channels, contacts and team.</p>
        </div>
        <Field label="Business name" error={error ?? undefined}>
          {({ id, describedBy, invalid }) => (
            <input id={id} value={name} onChange={(event) => setName(event.target.value)} autoComplete="organization" aria-invalid={invalid} aria-describedby={describedBy} className="field-input" />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create workspace'}
        </Button>
      </form>
    </div>
  )
}

function Shell() {
  const { signOut, session } = useAuth()
  const { tenants, current, loading, error, select, reload } = useWorkspace()

  if (loading) {
    return (
      <p role="status" className="grid min-h-screen place-items-center text-sm text-muted">
        <span className="flex items-center gap-2"><Loader2 aria-hidden className="size-4 animate-spin" /> Loading workspace…</span>
      </p>
    )
  }
  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <p role="alert" className="text-sm text-red-700">{error}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => void reload()}>Try again</Button>
            <Button variant="secondary" onClick={() => void signOut()}>Sign out</Button>
          </div>
        </div>
      </div>
    )
  }
  if (!current) return <CreateWorkspace />

  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-line bg-white lg:min-h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 p-4 lg:block">
          <Logo to="/app" />
          <nav aria-label="App" className="flex gap-1 lg:mt-8 lg:flex-col">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => cn('flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold', isActive ? 'bg-brand-50 text-brand-900' : 'text-ink-soft hover:bg-surface')}
              >
                <Icon aria-hidden className="size-4.5" /> <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 sm:px-8">
          {tenants.length > 1 ? (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">Workspace</span>
              <select value={current.id} onChange={(event) => select(event.target.value)} className="field-input w-auto py-1.5">
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm font-bold">{current.name}</p>
          )}
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{session?.user.email}</span>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut aria-hidden className="size-4" /> Sign out
            </Button>
          </div>
        </header>
        <main className="px-4 py-8 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default function AppLayout() {
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to={brand.loginPath} replace />
  return (
    <WorkspaceProvider key={session.user.id}>
      <Shell />
    </WorkspaceProvider>
  )
}
