import { AlertTriangle, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import { Logo } from '../components/Logo'
import { brand } from '../content/brand'
import { useAuth } from '../features/auth/AuthProvider'
import { usePageTitle } from '../hooks/usePageTitle'
import { supabase } from '../lib/supabase'

type Mode = 'signin' | 'signup'

export default function Login() {
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin')
  usePageTitle(mode === 'signup' ? 'Create your account' : 'Sign in')
  const { session } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to={brand.appPath} replace />

  const validate = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return 'Enter a valid email address.'
    if (password.length < 8) return 'Passwords need at least 8 characters.'
    return null
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setNotice(null)
    const problem = validate()
    setError(problem)
    if (problem || !supabase) return
    setBusy(true)
    const credentials = { email: email.trim(), password }
    const result =
      mode === 'signup'
        ? await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: `${window.location.origin}${brand.appPath}` } })
        : await supabase.auth.signInWithPassword(credentials)
    setBusy(false)
    if (result.error) return setError(result.error.message)
    if (mode === 'signup' && !result.data.session) {
      return setNotice(`Check ${credentials.email} for a confirmation link to finish creating your account.`)
    }
    navigate(brand.appPath, { replace: true })
  }

  const sendMagicLink = async () => {
    setNotice(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Enter your email first.')
    if (!supabase) return
    setBusy(true)
    const { error: linkError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${brand.appPath}` },
    })
    setBusy(false)
    if (linkError) return setError(linkError.message)
    setError(null)
    setNotice(`We emailed a sign-in link to ${email.trim()}.`)
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-brand-50 to-white px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Logo />
          <h1 className="mt-6 text-2xl font-extrabold tracking-tight">{mode === 'signup' ? 'Create your free account' : 'Sign in to your workspace'}</h1>
        </div>
        <div className="card mt-8 p-6 sm:p-8">
          {!supabase ? (
            <p role="alert" className="flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle aria-hidden className="size-5 shrink-0" />
              Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.
            </p>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-4">
              <Field label="Email">
                {({ id }) => <input id={id} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="field-input" />}
              </Field>
              <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
                {({ id, describedBy }) => (
                  <input id={id} type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby={describedBy} className="field-input" />
                )}
              </Field>
              {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              {notice && <p role="status" className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900">{notice}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </Button>
              {mode === 'signin' && (
                <Button variant="secondary" size="lg" className="w-full" disabled={busy} onClick={sendMagicLink}>
                  <Mail aria-hidden className="size-4" /> Email me a sign-in link
                </Button>
              )}
            </form>
          )}
        </div>
        <p className="mt-6 text-center text-sm text-ink-soft">
          {mode === 'signup' ? 'Already have an account?' : 'New to Autoshift?'}{' '}
          <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null); setNotice(null) }}>
            {mode === 'signup' ? 'Sign in' : 'Create a free account'}
          </button>
        </p>
        <p className="mt-2 text-center text-xs text-muted">
          By continuing you agree to the <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy policy</Link>.
        </p>
      </div>
    </div>
  )
}
