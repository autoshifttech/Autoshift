import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHero, Section } from '../../components/Layout'
import { toolLinks } from '../../content/navigation'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function ToolsIndex() {
  usePageTitle('Free WhatsApp tools')
  return (
    <>
      <PageHero eyebrow="Free tools" title="Free WhatsApp tools for small businesses" description="No sign-up, no watermark. Everything runs in your browser and nothing you enter is stored." />
      <Section className="pt-12 sm:pt-16">
        <ul className="grid gap-5 sm:grid-cols-2">
          {toolLinks.map(({ to, label, description, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="card group flex h-full items-start gap-5 p-6 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                {Icon && (
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                    <Icon aria-hidden className="size-6" />
                  </span>
                )}
                <span className="flex-1">
                  <span className="block text-lg font-bold group-hover:text-brand-700">{label}</span>
                  <span className="mt-1 block text-sm text-ink-soft">{description}</span>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                    Open tool <ArrowRight aria-hidden className="size-4 transition group-hover:translate-x-0.5" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
