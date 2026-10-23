import { Check } from 'lucide-react'
import { useState } from 'react'
import { Accordion } from '../components/Accordion'
import { ButtonLink } from '../components/Button'
import { PageHero, Section, SectionHeading } from '../components/Layout'
import { Reveal } from '../components/Reveal'
import { Segmented } from '../components/Segmented'
import { formatMoney, limitLabels, periods, plans, priceFor, type Currency, type Period, type Plan, type PlanFamily } from '../content/pricing'
import { usePageTitle } from '../hooks/usePageTitle'
import { cn } from '../lib/cn'

function PlanCard({ plan, currency, period }: { plan: Plan; currency: Currency; period: Period }) {
  const price = priceFor(plan, currency, period)
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-[var(--radius-card)] border bg-white p-6',
        plan.highlight ? 'border-brand-500 shadow-[var(--shadow-lift)] ring-1 ring-brand-500' : 'border-line shadow-[var(--shadow-card)]',
      )}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">Most popular</span>
      )}
      <h3 className="text-lg font-bold">{plan.name}</h3>
      <p className="mt-1 min-h-10 text-sm text-ink-soft">{plan.blurb}</p>
      <div className="mt-5">
        {price ? (
          <>
            <p className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold tracking-tight">{formatMoney(price.perMonth, currency)}</span>
              <span className="text-sm text-muted">/ month</span>
            </p>
            <p className="mt-1 h-5 text-xs text-muted">
              {price.perMonth === 0 ? 'Free forever' : price.months > 1 ? `Billed ${formatMoney(price.billed, currency)} every ${price.months} months` : 'Billed monthly'}
            </p>
          </>
        ) : (
          <>
            <p className="text-4xl font-extrabold tracking-tight">Custom</p>
            <p className="mt-1 h-5 text-xs text-muted">Volume pricing and annual terms</p>
          </>
        )}
      </div>
      <ButtonLink to={plan.cta.to} variant={plan.highlight ? 'primary' : 'secondary'} className="mt-6 w-full">
        {plan.cta.label}
      </ButtonLink>
      <ul className="mt-6 space-y-2.5 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2.5">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" /> {feature}
          </li>
        ))}
      </ul>
    </div>
  )
}

const billingFaq = [
  {
    question: 'How is AI usage billed?',
    answer: 'AI replies are pay-per-use. Each workspace has a prepaid AI wallet; every AI-handled conversation draws a small amount from it. Top up any time and set alerts so the assistant never stops mid-day.',
  },
  {
    question: 'Do you add a markup to WhatsApp message fees?',
    answer: 'No. Meta charges for some WhatsApp template messages. Those fees are passed through at cost with 0% markup and shown separately on your invoice.',
  },
  {
    question: 'Are taxes included?',
    answer: 'Prices exclude taxes. Applicable taxes (for example GST in India) are added at checkout based on your billing address.',
  },
  {
    question: 'Which billing periods are available?',
    answer: 'Monthly, quarterly, half-yearly and yearly. Longer periods are discounted — the toggle above shows the effective monthly price for each.',
  },
]

export default function Pricing() {
  usePageTitle('Pricing')
  const [family, setFamily] = useState<PlanFamily>('business')
  const [period, setPeriod] = useState<Period>('yearly')
  const [currency, setCurrency] = useState<Currency>('USD')
  const visible = plans.filter((plan) => plan.family === family)

  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Plans that grow with your conversations"
        description="Start free. Upgrade for more channels, assistants and teammates. AI usage is billed separately, pay-per-use."
      >
        <div className="mt-8 flex flex-col items-center gap-3">
          <Segmented
            label="Plan type"
            value={family}
            onChange={setFamily}
            options={[
              { value: 'business', label: 'Business plans' },
              { value: 'creator', label: 'Creator plans' },
            ]}
          />
          <div className="flex flex-wrap justify-center gap-3">
            <Segmented
              label="Billing period"
              value={period}
              onChange={setPeriod}
              options={periods.map((p) => ({ value: p.value, label: p.label, hint: p.discount ? `−${p.discount * 100}%` : undefined }))}
            />
            <Segmented
              label="Currency"
              value={currency}
              onChange={setCurrency}
              options={[
                { value: 'USD', label: 'USD' },
                { value: 'INR', label: 'INR' },
              ]}
            />
          </div>
          {family === 'creator' && <p className="text-sm text-ink-soft">Creator plans cover Instagram and Messenger. WhatsApp is not included.</p>}
        </div>
      </PageHero>

      <Section className="pt-12 sm:pt-16">
        <div className={cn('grid gap-5', visible.length > 3 ? 'md:grid-cols-2 xl:grid-cols-5' : 'mx-auto max-w-3xl md:grid-cols-2')}>
          {visible.map((plan) => (
            <PlanCard key={plan.id} plan={plan} currency={currency} period={period} />
          ))}
        </div>
      </Section>

      <Section className="bg-surface">
        <SectionHeading eyebrow="Compare" title="Plan limits side by side" />
        <Reveal className="card mt-10 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Plan limits for {family} plans</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="p-4 font-semibold text-muted">Limit</th>
                {visible.map((plan) => (
                  <th key={plan.id} scope="col" className="p-4 font-bold">{plan.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {limitLabels.map(({ key, label }) => (
                <tr key={key} className="border-b border-line last:border-b-0">
                  <th scope="row" className="p-4 font-medium text-ink-soft">{label}</th>
                  {visible.map((plan) => (
                    <td key={plan.id} className="p-4 font-semibold">{plan.limits[key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </Section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <SectionHeading align="left" eyebrow="Billing details" title="No surprises on your invoice" description="Questions about something not covered here? Our team will walk you through it." />
          <Accordion items={billingFaq} />
        </div>
      </Section>
    </>
  )
}
