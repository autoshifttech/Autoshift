import { Camera as Instagram, MessageCircle, MessagesSquare as Facebook, Sparkles, Workflow } from 'lucide-react'
import { Section, SectionHeading } from '../../components/Layout'
import { Reveal } from '../../components/Reveal'

const channels = [
  { name: 'WhatsApp', icon: MessageCircle, tone: 'bg-wa/15 text-[#128c4a]', text: 'Cloud API messaging, templates, broadcasts and coexistence with the WhatsApp Business app.' },
  { name: 'Instagram', icon: Instagram, tone: 'bg-pink-100 text-pink-700', text: 'DMs, story replies and comment-to-DM automations that answer in seconds.' },
  { name: 'Messenger', icon: Facebook, tone: 'bg-sky-100 text-sky-700', text: 'Page conversations handled by the same AI assistant and the same inbox.' },
]

export function Channels() {
  return (
    <Section className="pt-6 sm:pt-10">
      <div className="grid gap-4 md:grid-cols-3">
        {channels.map(({ name, icon: Icon, tone, text }, index) => (
          <Reveal key={name} delay={index * 80} className="card p-6">
            <span className={`grid size-11 place-items-center rounded-xl ${tone}`}>
              <Icon aria-hidden className="size-5" />
            </span>
            <h3 className="mt-4 text-lg font-bold">{name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{text}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

const flowBot = ['Customer must pick from fixed buttons', 'Breaks when the question isn’t in the flow', 'Ignores voice notes and photos', 'Every new product means rebuilding flows']
const aiBot = ['Understands free-form questions in any language', 'Adapts the reply to intent and context', 'Listens to voice notes and reads images', 'Learns your catalogue and policies once']

export function WhyAi() {
  return (
    <Section className="bg-surface">
      <SectionHeading
        eyebrow="Why AI conversations"
        title="Not another button-and-flow chatbot"
        description="Flow builders make customers fit your script. Autoshift holds a natural conversation, works out what the customer wants, and replies like your best salesperson would."
      />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <Reveal className="card p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-surface text-muted">
              <Workflow aria-hidden className="size-5" />
            </span>
            <h3 className="text-lg font-bold">Flow-based bots</h3>
          </div>
          <ul className="mt-6 space-y-3 text-sm text-ink-soft">
            {flowBot.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted/50" /> {item}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={80} className="rounded-[var(--radius-card)] bg-ink p-6 text-white shadow-[var(--shadow-lift)] sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-500/20 text-brand-200">
              <Sparkles aria-hidden className="size-5" />
            </span>
            <h3 className="text-lg font-bold">Autoshift AI</h3>
          </div>
          <ul className="mt-6 space-y-3 text-sm text-white/80">
            {aiBot.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" /> {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </Section>
  )
}
