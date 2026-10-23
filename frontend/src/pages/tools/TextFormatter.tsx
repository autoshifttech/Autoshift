import { Bold, Code, Italic, List, ListOrdered, Quote, Strikethrough } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { parseInline, prefixLines, wrapSelection, type FormatStyle } from '../../lib/whatsapp'
import { cn } from '../../lib/cn'
import { ToolShell } from './ToolShell'

const styleClass: Record<FormatStyle, string> = { bold: 'font-bold', italic: 'italic', strike: 'line-through', mono: 'font-mono text-[0.92em]' }

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((token, index) => (
        <span key={index} className={cn(...token.styles.map((style) => styleClass[style]))}>
          {token.text}
        </span>
      ))}
    </>
  )
}

function Preview({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  text.split('\n').forEach((line, index) => {
    const bullet = /^[-*] (.*)$/.exec(line)
    const numbered = /^(\d+)\. (.*)$/.exec(line)
    const quote = /^> (.*)$/.exec(line)
    if (bullet) blocks.push(<li key={index} className="ml-4 list-disc"><Inline text={bullet[1]} /></li>)
    else if (numbered) blocks.push(<li key={index} className="ml-4 list-none"><span className="mr-1">{numbered[1]}.</span><Inline text={numbered[2]} /></li>)
    else if (quote) blocks.push(<p key={index} className="border-l-4 border-brand-500/60 pl-2 text-ink-soft"><Inline text={quote[1]} /></p>)
    else blocks.push(<p key={index} className="min-h-[1.25em]"><Inline text={line} /></p>)
  })
  return <div className="space-y-0.5 text-sm leading-relaxed break-words">{blocks}</div>
}

const actions = [
  { label: 'Bold', icon: Bold, run: (t: string, s: number, e: number) => wrapSelection(t, s, e, 'bold') },
  { label: 'Italic', icon: Italic, run: (t: string, s: number, e: number) => wrapSelection(t, s, e, 'italic') },
  { label: 'Strikethrough', icon: Strikethrough, run: (t: string, s: number, e: number) => wrapSelection(t, s, e, 'strike') },
  { label: 'Monospace', icon: Code, run: (t: string, s: number, e: number) => wrapSelection(t, s, e, 'mono') },
  { label: 'Bulleted list', icon: List, run: (t: string, s: number, e: number) => prefixLines(t, s, e, 'bullet') },
  { label: 'Numbered list', icon: ListOrdered, run: (t: string, s: number, e: number) => prefixLines(t, s, e, 'number') },
  { label: 'Quote', icon: Quote, run: (t: string, s: number, e: number) => prefixLines(t, s, e, 'quote') },
]

export default function TextFormatter() {
  const [text, setText] = useState('*Festive sale* is live! 🎉\n\n- _20% off_ all kurtas\n- Free shipping over ₹999\n\nReply ```SHOP``` to get the catalogue.')
  const ref = useRef<HTMLTextAreaElement>(null)

  const apply = (run: (t: string, s: number, e: number) => { text: string; selectionStart: number; selectionEnd: number }) => {
    const area = ref.current
    if (!area) return
    const result = run(text, area.selectionStart, area.selectionEnd)
    setText(result.text)
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }

  return (
    <ToolShell
      path="/tools/whatsapp-text-formatter"
      title="WhatsApp text formatter"
      description="Select text and apply bold, italic, strikethrough, monospace, lists or quotes, and see exactly how it will look in WhatsApp."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1 border-b border-line p-2">
            {actions.map(({ label, icon: Icon, run }) => (
              <button
                key={label}
                type="button"
                title={label}
                aria-label={label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => apply(run)}
                className="grid size-10 place-items-center rounded-lg text-ink-soft hover:bg-brand-50 hover:text-brand-700"
              >
                <Icon aria-hidden className="size-4.5" />
              </button>
            ))}
          </div>
          <label htmlFor="formatter-input" className="sr-only">Message</label>
          <textarea
            id="formatter-input"
            ref={ref}
            rows={12}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="block w-full resize-y p-4 font-mono text-sm outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-3">
            <span className="text-xs text-muted">{text.length} characters</span>
            <CopyButton value={text} label="Copy formatted text" disabled={!text} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Preview</p>
          <div className="rounded-[var(--radius-card)] bg-wa-chat p-4 sm:p-6">
            <div className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm bg-wa-bubble px-3.5 py-2.5 shadow-sm">
              <Preview text={text} />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">Formatting uses WhatsApp’s own markers, so it works in chats, broadcasts and template messages.</p>
        </div>
      </div>
    </ToolShell>
  )
}
