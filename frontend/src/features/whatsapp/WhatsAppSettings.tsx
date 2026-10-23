import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, RefreshCw, RotateCcw, Unplug } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { api, ApiError } from '../../lib/api'
import { cn } from '../../lib/cn'
import { isMetaConfigured } from '../../lib/env'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { launchEmbeddedSignup, SignupAborted } from './embeddedSignup'
import { statusLabel, type WhatsAppAccount } from './types'

type Phase = 'idle' | 'popup' | 'saving'

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-semibold break-all sm:col-span-2 sm:mt-0">{value || '—'}</dd>
    </div>
  )
}

function ConnectCard({ canManage, onConnected }: { canManage: boolean; onConnected: (account: WhatsAppAccount) => void }) {
  const { current } = useWorkspace()
  const [coexistence, setCoexistence] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  const connect = async () => {
    if (!current) return
    setError(null)
    setPhase('popup')
    try {
      const result = await launchEmbeddedSignup({ coexistence })
      setPhase('saving')
      const account = await api<WhatsAppAccount>('/api/whatsapp/embedded-signup', {
        method: 'POST',
        tenantId: current.id,
        body: {
          code: result.code,
          waba_id: result.wabaId,
          phone_number_id: result.phoneNumberId,
          onboarding_type: result.onboardingType,
        },
      })
      onConnected(account)
    } catch (err) {
      if (err instanceof SignupAborted) setError(err.message)
      else if (err instanceof ApiError) setError(err.step ? `${err.message} (step: ${err.step})` : err.message)
      else setError(err instanceof Error ? err.message : 'Connecting WhatsApp failed.')
    } finally {
      setPhase('idle')
    }
  }

  const disabledReason = !isMetaConfigured
    ? 'WhatsApp signup is not configured. Set VITE_META_APP_ID and VITE_META_CONFIG_ID.'
    : !canManage
      ? 'Only workspace owners and admins can connect WhatsApp.'
      : null

  return (
    <div className="card p-6 sm:p-8">
      <span className="grid size-12 place-items-center rounded-2xl bg-wa/15 text-[#128c4a]">
        <MessageCircle aria-hidden className="size-6" />
      </span>
      <h2 className="mt-5 text-xl font-bold">Connect your WhatsApp Business number</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        A Meta window opens where you sign in with Facebook, choose or create a business portfolio and WhatsApp Business Account, and verify the
        number. Autoshift then subscribes to its messages and registers the number for the Cloud API.
      </p>
      <ul className="mt-5 grid gap-2 text-sm text-ink-soft sm:grid-cols-2">
        {['A Facebook account with admin access to your business', 'A phone number that can receive an SMS or call', 'Your business name and website', 'Pop-ups allowed for this site'].map((item) => (
          <li key={item} className="flex gap-2">
            <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" /> {item}
          </li>
        ))}
      </ul>
      <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 text-sm">
        <input type="checkbox" checked={coexistence} onChange={(event) => setCoexistence(event.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
        <span>
          <span className="block font-semibold">This number already uses the WhatsApp Business app</span>
          <span className="mt-0.5 block text-muted">Keep using the app on your phone while Autoshift handles messages too (coexistence).</span>
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-5 flex gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={connect} disabled={Boolean(disabledReason) || phase !== 'idle'} className="bg-[#128c4a] hover:bg-[#0e6f3b]">
          {phase === 'idle' ? <MessageCircle aria-hidden className="size-4" /> : <Loader2 aria-hidden className="size-4 animate-spin" />}
          {phase === 'popup' ? 'Complete the steps in the Meta window…' : phase === 'saving' ? 'Connecting your number…' : 'Connect WhatsApp'}
        </Button>
        {disabledReason && <p className="text-sm text-muted">{disabledReason}</p>}
      </div>
    </div>
  )
}

export function WhatsAppSettings() {
  const { current } = useWorkspace()
  const [account, setAccount] = useState<WhatsAppAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'refresh' | 'retry' | 'disconnect' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canManage = current?.role === 'owner' || current?.role === 'admin'

  const load = useCallback(async () => {
    if (!current) return
    setLoading(true)
    setError(null)
    try {
      const data = await api<{ account: WhatsAppAccount | null }>('/api/whatsapp/account', { tenantId: current.id })
      setAccount(data.account)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load WhatsApp settings')
    } finally {
      setLoading(false)
    }
  }, [current])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const run = async (kind: 'refresh' | 'retry' | 'disconnect') => {
    if (!current) return
    if (kind === 'disconnect' && !window.confirm('Disconnect this number? Autoshift will stop receiving its messages.')) return
    setBusy(kind)
    setError(null)
    try {
      const path = kind === 'disconnect' ? '/api/whatsapp/account' : `/api/whatsapp/account/${kind}`
      setAccount(await api<WhatsAppAccount>(path, { method: kind === 'disconnect' ? 'DELETE' : 'POST', tenantId: current.id }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted" role="status">
        <Loader2 aria-hidden className="size-4 animate-spin" /> Loading WhatsApp settings…
      </p>
    )
  }

  const showConnect = !account || account.connection_status === 'disconnected'
  const failed = account && ['subscribe_failed', 'registration_failed'].includes(account.connection_status)
  const status = account ? statusLabel[account.connection_status] : null

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {account && !showConnect && status && (
        <div className="card p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted">Connected number</p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight">{account.display_phone_number ?? account.phone_number_id}</p>
              {account.verified_name && <p className="mt-1 text-sm text-ink-soft">{account.verified_name}</p>}
            </div>
            <span className={cn('rounded-full px-3 py-1 text-xs font-bold', status.tone)}>{status.label}</span>
          </div>

          {account.last_error && (
            <div role="alert" className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">
                {account.last_error.step === 'account_update' ? `Meta reported ${account.last_error.event}` : `Step “${account.last_error.step}” failed`}
              </p>
              {account.last_error.message && <p className="mt-1">{account.last_error.message}</p>}
            </div>
          )}

          <dl className="mt-6 divide-y divide-line border-t border-line">
            <Detail label="Number status" value={account.number_status} />
            <Detail label="Quality rating" value={account.quality_rating} />
            <Detail label="Display name review" value={account.name_status} />
            <Detail label="Webhooks" value={account.webhooks_subscribed ? 'Subscribed' : 'Not subscribed'} />
            <Detail label="Cloud API registration" value={account.onboarding_type === 'coexistence' ? 'Coexistence (WhatsApp Business app)' : account.phone_registered ? 'Registered' : 'Not registered'} />
            <Detail label="WhatsApp Business Account ID" value={account.waba_id} />
            <Detail label="Phone number ID" value={account.phone_number_id} />
            <Detail label="Connected on" value={formatDate(account.connected_at)} />
            <Detail label="Last webhook received" value={formatDate(account.last_webhook_at)} />
          </dl>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => run('refresh')} disabled={busy !== null}>
              <RefreshCw aria-hidden className={cn('size-4', busy === 'refresh' && 'animate-spin')} /> Refresh status
            </Button>
            {failed && canManage && (
              <Button onClick={() => run('retry')} disabled={busy !== null}>
                <RotateCcw aria-hidden className={cn('size-4', busy === 'retry' && 'animate-spin')} /> Retry setup
              </Button>
            )}
            {canManage && (
              <Button variant="danger" onClick={() => run('disconnect')} disabled={busy !== null}>
                <Unplug aria-hidden className="size-4" /> Disconnect
              </Button>
            )}
          </div>
        </div>
      )}
      {showConnect && (
        <>
          {account?.connection_status === 'disconnected' && (
            <p className="rounded-xl bg-surface px-4 py-3 text-sm text-ink-soft">
              {account.display_phone_number ?? 'The previous number'} was disconnected. Connect again to resume messaging.
            </p>
          )}
          <ConnectCard canManage={canManage} onConnected={setAccount} />
        </>
      )}
    </div>
  )
}
