import { Link } from 'react-router-dom'
import { brand } from '../content/brand'
import { cn } from '../lib/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8', className)}>
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path d="M9 21.5 14.5 10h3L23 21.5h-3.2l-1.1-2.5h-5.4l-1.1 2.5H9Zm5.3-5h3.4L16 12.6l-1.7 3.9Z" fill="#fff" />
    </svg>
  )
}

export function Logo({ to = '/', light = false }: { to?: string; light?: boolean }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5" aria-label={`${brand.name} home`}>
      <LogoMark className={light ? 'text-brand-500' : 'text-brand-600'} />
      <span className={cn('text-lg font-extrabold tracking-tight', light ? 'text-white' : 'text-ink')}>{brand.name}</span>
    </Link>
  )
}
