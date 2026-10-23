import { ArrowRight, CheckCircle2, Mic } from 'lucide-react'
import { ButtonLink } from '../../components/Button'
import { ChatMock, type ChatLine } from '../../components/ChatMock'
import { Container } from '../../components/Layout'
import { brand } from '../../content/brand'

const demo: ChatLine[] = [
  { from: 'customer', text: 'Hi! Do you have the linen shirt in olive, size M?', meta: '10:21' },
  { from: 'bot', text: 'Yes — olive in M is in stock 🙌 It’s ₹1,499 and ships tomorrow. Want the link?', meta: '10:21' },
  {
    from: 'customer',
    text: (
      <span className="inline-flex items-center gap-1.5">
        <Mic aria-hidden className="size-3.5 text-brand-700" /> Voice note · 0:07
      </span>
    ),
    meta: '10:22',
  },
  { from: 'bot', text: 'Got it — delivery to Coimbatore by Friday. I’ve added the shirt to your cart: shop.example/c/8F2', meta: '10:22' },
  { from: 'customer', text: 'Perfect, ordering now!', meta: '10:23' },
]

const points = ['Official WhatsApp Business Cloud API', 'Keeps your WhatsApp Business app working', 'Free plan, no card required']

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
      <div aria-hidden className="pointer-events-none absolute -top-48 right-[-10%] size-[36rem] rounded-full bg-brand-200/45 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute top-40 left-[-15%] size-[26rem] rounded-full bg-accent/10 blur-3xl" />
      <Container className="relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:py-24">
        <div>
          <span className="eyebrow">WhatsApp · Instagram · Messenger</span>
          <h1 className="mt-5 text-4xl leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Turn every chat into a <span className="text-brand-600">customer</span> — automatically
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">{brand.description}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to={brand.signupPath} size="lg">
              Start free <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
            <ButtonLink to="/contact?topic=sales" variant="secondary" size="lg">
              Talk to sales
            </ButtonLink>
          </div>
          <ul className="mt-8 grid gap-2.5 text-sm text-ink-soft sm:grid-cols-1">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <CheckCircle2 aria-hidden className="size-4.5 shrink-0 text-brand-600" /> {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <ChatMock title="Olive & Thread" subtitle="AI assistant · replies instantly" lines={demo} animate />
          <div className="card absolute -bottom-4 left-0 hidden w-52 p-3 sm:block lg:-left-6">
            <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Lead tagged</p>
            <p className="mt-1 text-sm font-bold text-ink">Interested → Converted</p>
            <p className="mt-1 text-xs text-muted">City: Coimbatore · Size: M</p>
          </div>
        </div>
      </Container>
    </section>
  )
}
