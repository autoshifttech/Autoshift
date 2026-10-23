import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Reveal } from './Reveal'

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>
}

export function Section({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn('py-16 sm:py-24', className)}>
      <Container>{children}</Container>
    </section>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  align?: 'center' | 'left'
}) {
  return (
    <Reveal className={cn('max-w-3xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2 className="mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">{description}</p>}
    </Reveal>
  )
}

export function PageHero({ eyebrow, title, description, children }: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-brand-50 to-white">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-80 max-w-3xl rounded-full bg-brand-200/40 blur-3xl" />
      <Container className="relative py-14 text-center sm:py-20">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">{title}</h1>
        {description && <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">{description}</p>}
        {children}
      </Container>
    </section>
  )
}
