import { CheckCheck, Mic, Paperclip } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'

export type ChatLine = { from: 'customer' | 'bot' | 'agent'; text: ReactNode; meta?: string }

function Bubble({ line }: { line: ChatLine }) {
  const outgoing = line.from !== 'customer'
  return (
    <div className={cn('animate-bubble flex', outgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm',
          outgoing ? 'rounded-tr-sm bg-wa-bubble text-ink' : 'rounded-tl-sm bg-white text-ink',
        )}
      >
        {line.from === 'bot' && <span className="mb-0.5 block text-[10px] font-bold tracking-wide text-brand-700 uppercase">AI assistant</span>}
        {line.from === 'agent' && <span className="mb-0.5 block text-[10px] font-bold tracking-wide text-accent uppercase">Team</span>}
        <span className="block">{line.text}</span>
        <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted">
          {line.meta ?? '10:24'}
          {outgoing && <CheckCheck aria-hidden className="size-3 text-sky-500" />}
        </span>
      </div>
    </div>
  )
}

/** A WhatsApp-style phone frame. When `animate` is set, lines appear one by one and loop. */
export function ChatMock({
  title,
  subtitle = 'online',
  lines,
  animate = false,
  className,
}: {
  title: string
  subtitle?: string
  lines: ChatLine[]
  animate?: boolean
  className?: string
}) {
  const [reducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const animated = animate && !reducedMotion
  const [count, setCount] = useState(animated ? 1 : lines.length)

  useEffect(() => {
    if (!animated) return
    const timer = window.setTimeout(
      () => setCount((value) => (value >= lines.length ? 1 : value + 1)),
      count >= lines.length ? 4200 : 1500,
    )
    return () => window.clearTimeout(timer)
  }, [animated, count, lines.length])

  const visible = lines.slice(0, count)
  const typing = animated && count < lines.length && lines[count]?.from !== 'customer'

  return (
    <div className={cn('mx-auto w-full max-w-[22rem] rounded-[2.25rem] border-[10px] border-ink bg-ink shadow-[var(--shadow-lift)]', className)}>
      <div className="overflow-hidden rounded-[1.6rem]">
        <div className="flex items-center gap-3 bg-brand-900 px-4 py-3 text-white">
          <span className="grid size-9 place-items-center rounded-full bg-brand-500 text-sm font-bold">{title.slice(0, 1)}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="text-[11px] text-brand-200">{subtitle}</p>
          </div>
        </div>
        <div aria-live="off" className="flex h-[23rem] flex-col justify-end gap-2 overflow-hidden bg-wa-chat p-3">
          {visible.map((line, index) => (
            <Bubble key={index} line={line} />
          ))}
          {typing && (
            <div className="flex justify-end" aria-hidden>
              <span className="flex gap-1 rounded-2xl bg-wa-bubble px-3 py-2.5">
                {[0, 1, 2].map((dot) => (
                  <span key={dot} className="typing-dot size-1.5 rounded-full bg-ink-soft" style={{ animationDelay: `${dot * 0.15}s` }} />
                ))}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 bg-wa-chat px-3 pb-3">
          <span className="flex h-9 flex-1 items-center gap-2 rounded-full bg-white px-3 text-xs text-muted">
            <Paperclip aria-hidden className="size-3.5" /> Message
          </span>
          <span className="grid size-9 place-items-center rounded-full bg-brand-600 text-white">
            <Mic aria-hidden className="size-4" />
          </span>
        </div>
      </div>
    </div>
  )
}
