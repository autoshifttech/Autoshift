import { Inbox, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button, ButtonLink } from '../../components/Button'
import { useWorkspace } from '../../features/workspace/WorkspaceProvider'
import { usePageTitle } from '../../hooks/usePageTitle'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type Message = {
  wamid: string
  from_number: string
  contact_name: string | null
  message_type: string
  text: string | null
  sent_at: string
  latest_status: string | null
}

export default function InboxPage() {
  usePageTitle('Inbox')
  const { current } = useWorkspace()
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!current) return
    setRefreshing(true)
    setError(null)
    try {
      setMessages(await api<Message[]>('/api/whatsapp/messages?limit=100', { tenantId: current.id }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages')
    } finally {
      setRefreshing(false)
    }
  }, [current])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-ink-soft">Latest WhatsApp messages received by this workspace.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw aria-hidden className={cn('size-4', refreshing && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {error && <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {messages === null && !error && (
        <p role="status" className="mt-10 flex items-center gap-2 text-sm text-muted">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Loading messages…
        </p>
      )}

      {messages?.length === 0 && (
        <div className="card mt-8 p-10 text-center">
          <Inbox aria-hidden className="mx-auto size-10 text-muted" />
          <h2 className="mt-4 text-lg font-bold">No messages yet</h2>
          <p className="mt-1 text-sm text-ink-soft">Connect a WhatsApp number, then send it a message to see it here.</p>
          <ButtonLink to="/app/settings/whatsapp" className="mt-6">Go to WhatsApp settings</ButtonLink>
        </div>
      )}

      {messages && messages.length > 0 && (
        <ul className="card mt-8 divide-y divide-line">
          {messages.map((message) => (
            <li key={message.wamid} className="flex gap-4 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                {(message.contact_name ?? message.from_number).slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-semibold">
                    {message.contact_name ?? `+${message.from_number}`}
                    {message.contact_name && <span className="ml-2 text-xs font-normal text-muted">+{message.from_number}</span>}
                  </p>
                  <time dateTime={message.sent_at} className="text-xs text-muted">
                    {new Date(message.sent_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </time>
                </div>
                <p className="mt-1 text-sm break-words text-ink-soft">{message.text ?? <em className="text-muted">[{message.message_type}]</em>}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
