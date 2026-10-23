import { ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Container } from '../../components/Layout'
import { toolLinks } from '../../content/navigation'
import { countries } from '../../lib/whatsapp'
import { usePageTitle } from '../../hooks/usePageTitle'

export function ToolShell({ title, description, path, children }: { title: string; description: string; path: string; children: ReactNode }) {
  usePageTitle(title)
  const others = toolLinks.filter((tool) => tool.to !== path)
  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-brand-50 to-white">
        <Container className="py-10 sm:py-14">
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <Link to="/tools" className="hover:text-ink">Free tools</Link> <span aria-hidden>/</span> <span className="text-ink">{title}</span>
          </nav>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-ink-soft">{description}</p>
          <p className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-brand-700">
            <ShieldCheck aria-hidden className="size-4" /> Runs entirely in your browser — nothing is uploaded or stored.
          </p>
        </Container>
      </section>
      <Container className="py-10 sm:py-14">{children}</Container>
      <Container className="pb-16">
        <h2 className="text-lg font-bold">More free tools</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {others.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="card flex items-center gap-3 p-4 hover:border-brand-200">
                {Icon && <Icon aria-hidden className="size-5 text-brand-600" />}
                <span className="text-sm font-semibold">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </>
  )
}

export function CountrySelect({ id, value, onChange }: { id?: string; value: string; onChange: (code: string) => void }) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="field-input">
      {countries.map((country) => (
        <option key={country.code} value={country.code}>
          {country.name} (+{country.dial})
        </option>
      ))}
    </select>
  )
}
