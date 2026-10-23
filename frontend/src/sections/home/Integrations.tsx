import { ArrowRight, Braces, Database, Mic, ShoppingCart, Store, Webhook, Wallet, Percent, Gift } from 'lucide-react'
import { ButtonLink } from '../../components/Button'
import { Section, SectionHeading } from '../../components/Layout'
import { Reveal } from '../../components/Reveal'
import { toolLinks } from '../../content/navigation'
import { brand } from '../../content/brand'
import { Link } from 'react-router-dom'

const integrations = [
  { icon: Store, name: 'Shopify', text: 'Products, orders and abandoned-cart follow-ups.' },
  { icon: ShoppingCart, name: 'WooCommerce', text: 'Catalogue sync and order status replies.' },
  { icon: Database, name: 'Zoho CRM', text: 'Create and update leads from conversations.' },
  { icon: Mic, name: 'AI voice providers', text: 'Plug in the calling provider you prefer.' },
  { icon: Webhook, name: 'Webhooks', text: 'Push events to any backend in real time.' },
  { icon: Braces, name: 'REST API', text: 'Contacts, messages and campaigns over HTTPS.' },
]

export function Integrations() {
  return (
    <Section id="integrations" className="bg-surface">
      <SectionHeading
        eyebrow="Integrations"
        title="Connects to the tools you already run on"
        description="Native integrations for commerce and CRM, plus webhooks and an API for everything else. Custom integrations are available on Enterprise."
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map(({ icon: Icon, name, text }, index) => (
          <Reveal key={name} delay={index * 50} className="card flex gap-4 p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-white">
              <Icon aria-hidden className="size-5" />
            </span>
            <span>
              <span className="block font-bold">{name}</span>
              <span className="mt-1 block text-sm text-ink-soft">{text}</span>
            </span>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

const pricingPoints = [
  { icon: Gift, title: 'Free plan', text: 'One channel, one AI assistant, free forever.' },
  { icon: Wallet, title: 'Pay-per-use AI', text: 'AI replies draw from a prepaid wallet — pay only for what you use.' },
  { icon: Percent, title: '0% markup on Meta fees', text: 'WhatsApp template charges are passed through at cost.' },
]

export function PricingBand() {
  return (
    <Section>
      <div className="overflow-hidden rounded-[2rem] bg-ink px-6 py-12 text-white sm:px-12">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">Simple plans. Transparent usage.</h2>
            <p className="mt-4 text-white/70">Pick a plan for your channels and team, then top up AI usage as you grow.</p>
            <ButtonLink to="/pricing" className="mt-8" size="lg">
              See pricing <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {pricingPoints.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                <Icon aria-hidden className="size-5 text-brand-500" />
                <p className="mt-3 font-bold">{title}</p>
                <p className="mt-1 text-sm text-white/65">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

export function ToolsTeaser() {
  return (
    <Section className="pt-0 sm:pt-0">
      <SectionHeading eyebrow="Free WhatsApp tools" title="Handy tools, no sign-up needed" description="Everything runs in your browser. Nothing you type is stored." />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {toolLinks.map(({ label, to, description, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className="card group flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
              {Icon && <Icon aria-hidden className="size-6 text-brand-600" />}
              <span className="mt-4 font-bold group-hover:text-brand-700">{label}</span>
              <span className="mt-1 text-sm text-ink-soft">{description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function FinalCta() {
  return (
    <section className="bg-gradient-to-br from-brand-600 to-brand-900 text-white">
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <h2 className="text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Your next customer is already typing.</h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-white/80">Connect WhatsApp in a few minutes and let {brand.name} answer the next message.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink to={brand.signupPath} variant="dark" size="lg">Start free</ButtonLink>
          <ButtonLink to="/contact?topic=sales" variant="secondary" size="lg">Talk to sales</ButtonLink>
        </div>
      </div>
    </section>
  )
}
