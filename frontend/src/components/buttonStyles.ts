import { cn } from '../lib/cn'

export type Variant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger'
export type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-900',
  secondary: 'border border-line bg-white text-ink hover:border-brand-200 hover:bg-brand-50',
  ghost: 'text-ink-soft hover:bg-surface hover:text-ink',
  dark: 'bg-ink text-white hover:bg-brand-900',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
}
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
}

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-55',
    variants[variant],
    sizes[size],
    className,
  )
}
