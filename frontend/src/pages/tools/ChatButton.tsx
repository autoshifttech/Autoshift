import { MessageCircle, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { Field } from '../../components/Field'
import { Segmented } from '../../components/Segmented'
import { buildWaLink, countries, validateNationalNumber } from '../../lib/whatsapp'
import { CountrySelect, ToolShell } from './ToolShell'

type Position = 'right' | 'left'

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

function snippet({ link, color, position, label }: { link: string; color: string; position: Position; label: string }) {
  const side = position === 'right' ? 'right:20px' : 'left:20px'
  return `<!-- WhatsApp chat button -->
<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(label)}"
   style="position:fixed;bottom:20px;${side};z-index:9999;display:flex;align-items:center;gap:8px;padding:12px 18px;border-radius:999px;background:${color};color:#fff;font:600 15px/1 system-ui,sans-serif;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.18)">
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3s-1 1-1 2.4 1 2.8 1.2 3 2 3.1 4.9 4.3c1.8.8 2.5.8 3.4.7.5-.1 1.5-.6 1.8-1.2s.2-1.1.1-1.2l-.6-.3Z"/></svg>
  ${escapeHtml(label)}
</a>`
}

export default function ChatButton() {
  const [country, setCountry] = useState('IN')
  const [number, setNumber] = useState('')
  const [greeting, setGreeting] = useState('Hi! I have a question.')
  const [label, setLabel] = useState('Chat with us')
  const [color, setColor] = useState('#25d366')
  const [position, setPosition] = useState<Position>('right')
  const [touched, setTouched] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(true)

  const dial = countries.find((c) => c.code === country)!.dial
  const error = validateNationalNumber(dial, number)
  const link = error ? '' : buildWaLink(dial, number, greeting)
  const code = useMemo(() => (link ? snippet({ link, color, position, label: label || 'Chat on WhatsApp' }) : ''), [link, color, position, label])

  return (
    <ToolShell
      path="/tools/whatsapp-chat-button"
      title="WhatsApp chat button"
      description="Add a floating “Chat on WhatsApp” button to any website. Configure it, preview it, and paste one snippet before </body>."
    >
      <div className="grid gap-10 lg:grid-cols-2">
        <form className="card min-w-0 space-y-5 p-6 sm:p-8" onSubmit={(event) => event.preventDefault()} noValidate>
          <div className="grid gap-4 sm:grid-cols-[1fr_1.3fr]">
            <Field label="Country">{({ id }) => <CountrySelect id={id} value={country} onChange={setCountry} />}</Field>
            <Field label="WhatsApp number" hint="Without the country code" error={touched ? (error ?? undefined) : undefined}>
              {({ id, describedBy, invalid }) => (
                <input id={id} inputMode="tel" placeholder="98765 43210" value={number} onChange={(event) => setNumber(event.target.value)} onBlur={() => setTouched(true)} aria-invalid={invalid} aria-describedby={describedBy} className="field-input" />
              )}
            </Field>
          </div>
          <Field label="Button label">
            {({ id }) => <input id={id} value={label} maxLength={40} onChange={(event) => setLabel(event.target.value)} className="field-input" />}
          </Field>
          <Field label="Greeting message">
            {({ id }) => <input id={id} value={greeting} maxLength={200} onChange={(event) => setGreeting(event.target.value)} className="field-input" />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Colour">
              {({ id }) => <input id={id} type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-11 w-full cursor-pointer rounded-xl border border-line bg-white p-1" />}
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-semibold">Position</p>
              <Segmented label="Button position" value={position} onChange={setPosition} options={[{ value: 'left', label: 'Bottom left' }, { value: 'right', label: 'Bottom right' }]} />
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold">Embed code</p>
            <pre className="max-h-56 overflow-auto rounded-xl bg-ink p-4 text-xs leading-relaxed text-brand-100">
              <code>{code || '<!-- Enter a valid number to generate the snippet -->'}</code>
            </pre>
            <div className="mt-3">
              <CopyButton value={code} label="Copy snippet" disabled={!code} />
            </div>
          </div>
        </form>
        <div>
          <p className="mb-2 text-sm font-semibold">Live preview</p>
          <div className="relative h-[28rem] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            <div className="space-y-3 p-6" aria-hidden>
              <div className="h-6 w-1/2 rounded bg-line" />
              <div className="h-3 w-5/6 rounded bg-line/70" />
              <div className="h-3 w-4/6 rounded bg-line/70" />
              <div className="mt-6 h-32 rounded-xl bg-line/50" />
            </div>
            {previewOpen && (
              <div className={`absolute bottom-20 w-64 rounded-2xl bg-white p-4 shadow-[var(--shadow-lift)] ${position === 'right' ? 'right-5' : 'left-5'}`}>
                <button type="button" aria-label="Close preview bubble" onClick={() => setPreviewOpen(false)} className="absolute top-2 right-2 rounded-full p-1 text-muted hover:bg-surface">
                  <X aria-hidden className="size-4" />
                </button>
                <p className="text-sm font-semibold">Need help?</p>
                <p className="mt-1 text-xs text-muted">Visitors are taken to WhatsApp with: “{greeting}”</p>
              </div>
            )}
            <a
              href={link || undefined}
              aria-disabled={!link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                if (!link) event.preventDefault()
                setPreviewOpen(true)
              }}
              className={`absolute bottom-5 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg ${position === 'right' ? 'right-5' : 'left-5'}`}
              style={{ background: color }}
            >
              <MessageCircle aria-hidden className="size-5" /> {label || 'Chat on WhatsApp'}
            </a>
          </div>
        </div>
      </div>
    </ToolShell>
  )
}
