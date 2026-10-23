import { Camera as Instagram, MessageCircle, PhoneCall, Search, Users } from 'lucide-react'
import { Section, SectionHeading } from '../../components/Layout'
import { Reveal } from '../../components/Reveal'
import { cn } from '../../lib/cn'

const threads = [
  { name: 'Priya R.', channel: 'whatsapp', preview: 'Perfect, ordering now!', owner: 'AI', time: '10:23', active: true },
  { name: '@leo.travels', channel: 'instagram', preview: 'Is the tour still available?', owner: 'Meera', time: '10:18' },
  { name: 'Arjun K.', channel: 'whatsapp', preview: 'Can you share bulk pricing?', owner: 'AI', time: '09:57' },
  { name: 'Sara M.', channel: 'messenger', preview: 'Friday 3pm works for me', owner: 'Rahul', time: '09:40' },
]

const channelIcon = { whatsapp: MessageCircle, instagram: Instagram, messenger: Users } as const

export function SharedInbox() {
  return (
    <Section id="inbox" className="bg-surface">
      <SectionHeading
        eyebrow="Shared inbox"
        title="One inbox for every channel and every teammate"
        description="See AI and human conversations side by side, assign chats, and step in whenever a customer needs a person."
      />
      <Reveal className="card mt-12 overflow-hidden">
        <div className="grid md:grid-cols-[18rem_1fr]">
          <div className="border-b border-line md:border-r md:border-b-0">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm text-muted">
              <Search aria-hidden className="size-4" /> Search conversations
            </div>
            <ul>
              {threads.map((thread) => {
                const Icon = channelIcon[thread.channel as keyof typeof channelIcon]
                return (
                  <li key={thread.name} className={cn('flex gap-3 border-b border-line px-4 py-3 last:border-b-0', thread.active && 'bg-brand-50')}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-brand-700 shadow-sm">
                      <Icon aria-hidden className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-2 text-sm font-semibold">
                        <span className="truncate">{thread.name}</span>
                        <span className="text-xs font-normal text-muted">{thread.time}</span>
                      </span>
                      <span className="block truncate text-xs text-muted">{thread.preview}</span>
                      <span className="mt-1 inline-block rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-ink-soft ring-1 ring-line">
                        {thread.owner === 'AI' ? 'AI assistant' : `Assigned · ${thread.owner}`}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="flex min-h-72 flex-col gap-3 bg-wa-chat/60 p-4 sm:p-6">
            <p className="self-center rounded-full bg-white px-3 py-1 text-[11px] text-muted shadow-sm">Today</p>
            <p className="max-w-sm self-start rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm shadow-sm">Hi! Do you have the linen shirt in olive, size M?</p>
            <p className="max-w-sm self-end rounded-2xl rounded-tr-sm bg-wa-bubble px-3 py-2 text-sm shadow-sm">Yes — olive in M is in stock 🙌 Want the link?</p>
            <p className="max-w-sm self-start rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm shadow-sm">Perfect, ordering now!</p>
            <div className="mt-auto flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-2 text-xs text-muted">
              <span className="rounded-lg bg-surface px-2 py-1 font-semibold text-ink">Take over from AI</span>
              <span className="rounded-lg bg-surface px-2 py-1">Assign</span>
              <span className="rounded-lg bg-surface px-2 py-1">Add note</span>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  )
}

export function Automations() {
  return (
    <Section id="automations">
      <SectionHeading eyebrow="Beyond chat" title="Calls and comments, handled too" />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <Reveal className="card p-6 sm:p-8">
          <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <PhoneCall aria-hidden className="size-5" />
          </span>
          <h3 className="mt-5 text-xl font-bold">AI voice calls</h3>
          <p className="mt-2 leading-relaxed text-ink-soft">
            Call new leads within minutes, confirm orders or appointments, and log the outcome back to the contact — with the same knowledge your chat assistant uses.
          </p>
        </Reveal>
        <Reveal delay={80} className="card p-6 sm:p-8">
          <span className="grid size-11 place-items-center rounded-xl bg-pink-100 text-pink-700">
            <Instagram aria-hidden className="size-5" />
          </span>
          <h3 className="mt-5 text-xl font-bold">Instagram comment-to-DM</h3>
          <p className="mt-2 leading-relaxed text-ink-soft">
            When someone comments a keyword on your post or reel, reply publicly and start a private DM with the link, price or details they asked for.
          </p>
        </Reveal>
      </div>
    </Section>
  )
}
