import { ChevronDown, Menu, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink as RouterNavLink, useLocation } from 'react-router-dom'
import { brand } from '../content/brand'
import { primaryLinks, productLinks, toolLinks, type NavLink } from '../content/navigation'
import { cn } from '../lib/cn'
import { ButtonLink } from './Button'
import { Container } from './Layout'
import { Logo } from './Logo'

function Dropdown({ label, items, wide = false }: { label: string; items: NavLink[]; wide?: boolean }) {
  // Remember which navigation the menu was opened on, so any route change closes it.
  const location = useLocation()
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === location.key
  const setOpen = (next: boolean | ((value: boolean) => boolean)) =>
    setOpenOn((typeof next === 'function' ? next(open) : next) ? location.key : null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpenOn(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenOn(null)
        ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-ink-soft hover:text-ink"
      >
        {label}
        <ChevronDown aria-hidden className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-1/2 z-50 -translate-x-1/2 pt-2">
          <ul className={cn('card grid gap-1 p-2', wide ? 'w-[36rem] grid-cols-2' : 'w-80')}>
            {items.map(({ label: itemLabel, to, description, icon: Icon }) => (
              <li key={to}>
                <Link to={to} className="flex gap-3 rounded-xl p-3 hover:bg-surface">
                  {Icon && (
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                      <Icon aria-hidden className="size-4.5" />
                    </span>
                  )}
                  <span>
                    <span className="block text-sm font-semibold text-ink">{itemLabel}</span>
                    {description && <span className="mt-0.5 block text-xs leading-snug text-muted">{description}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>('a, button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('a, button'))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const group = (title: string, items: NavLink[]) => (
    <div>
      <p className="px-3 text-xs font-semibold tracking-wide text-muted uppercase">{title}</p>
      <ul className="mt-2">
        {items.map((item) => (
          <li key={item.to}>
            <Link to={item.to} onClick={onClose} className="block rounded-xl px-3 py-2.5 text-base font-medium hover:bg-surface">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" aria-label="Close menu" tabIndex={-1} className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div ref={panelRef} className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col overflow-y-auto bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <Logo />
          <button type="button" onClick={onClose} aria-label="Close menu" className="grid size-11 place-items-center rounded-full hover:bg-surface">
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <nav className="mt-6 space-y-6" aria-label="Mobile">
          {group('Product', productLinks)}
          {group('Free tools', toolLinks)}
          {group('Company', primaryLinks)}
        </nav>
        <div className="mt-auto grid gap-2 pt-8">
          <ButtonLink to={brand.signupPath} size="lg">Start free</ButtonLink>
          <ButtonLink to={brand.loginPath} variant="secondary" size="lg">Sign in</ButtonLink>
        </div>
      </div>
    </div>
  )
}

export function Header() {
  const location = useLocation()
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null)
  const menuOpen = menuOpenOn === location.key
  const [scrolled, setScrolled] = useState(false)
  const closeMenu = useCallback(() => setMenuOpenOn(null), [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={cn('sticky top-0 z-40 border-b bg-white/85 backdrop-blur transition-colors', scrolled ? 'border-line' : 'border-transparent')}>
      <Container className="flex h-16 items-center justify-between gap-4 lg:h-18">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          <Dropdown label="Product" items={productLinks} wide />
          <Dropdown label="Free tools" items={toolLinks} />
          {primaryLinks.map((link) => (
            <RouterNavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => cn('rounded-full px-3 py-2 text-sm font-semibold', isActive ? 'text-brand-700' : 'text-ink-soft hover:text-ink')}
            >
              {link.label}
            </RouterNavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <ButtonLink to={brand.loginPath} variant="ghost" size="sm">Sign in</ButtonLink>
          <ButtonLink to={brand.signupPath} size="sm">Start free</ButtonLink>
        </div>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full hover:bg-surface lg:hidden"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpenOn(location.key)}
        >
          <Menu aria-hidden className="size-6" />
        </button>
      </Container>
      {menuOpen && <MobileMenu onClose={closeMenu} />}
    </header>
  )
}
