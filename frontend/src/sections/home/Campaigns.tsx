import { CalendarClock, Filter, RefreshCcw, Repeat2, Send } from 'lucide-react'
import { Section, SectionHeading } from '../../components/Layout'
import { Reveal } from '../../components/Reveal'

const features = [
  { icon: Send, title: 'Broadcast campaigns', text: 'Send approved WhatsApp templates to thousands of opted-in contacts at once.' },
  { icon: Repeat2, title: 'Drip flows', text: 'Follow up automatically over days or weeks until a lead replies.' },
  { icon: Filter, title: 'Audience filters', text: 'Target by segment, tag, extracted field or last activity.' },
  { icon: CalendarClock, title: 'Scheduling', text: 'Queue sends for the time your customers actually read messages.' },
  { icon: RefreshCcw, title: 'Resend to undelivered', text: 'Retry only the contacts a campaign didn’t reach.' },
]

const funnel = [
  { label: 'Sent', value: 100 },
  { label: 'Delivered', value: 94 },
  { label: 'Read', value: 71 },
  { label: 'Replied', value: 23 },
]

export function Campaigns() {
  return (
    <Section id="campaigns">
      <SectionHeading
        eyebrow="Campaigns"
        title="Reach the right people, then let AI handle the replies"
        description="Every campaign reply lands in the shared inbox where the assistant picks it up instantly."
      />
      <div className="mt-12 grid items-start gap-6 lg:grid-cols-[1fr_1.1fr]">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {features.map(({ icon: Icon, title, text }, index) => (
            <li key={title}>
              <Reveal delay={index * 60} className="flex h-full gap-4 rounded-2xl border border-line p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="mt-1 block text-sm text-ink-soft">{text}</span>
                </span>
              </Reveal>
            </li>
          ))}
        </ul>
        <Reveal delay={100} className="card p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Campaign report</p>
              <p className="mt-1 text-lg font-bold">Festive sale · Template “offer_v2”</p>
            </div>
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">Completed</span>
          </div>
          <div className="mt-8 space-y-5">
            {funnel.map(({ label, value }) => (
              <div key={label}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{label}</span>
                  <span className="font-bold">{value}%</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface" role="presentation">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700" style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-muted">Illustrative example data. Real reports show delivery, read and reply analytics per campaign.</p>
        </Reveal>
      </div>
    </Section>
  )
}
