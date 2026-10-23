import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { buttonClass, type Size, type Variant } from './buttonStyles'

type CommonProps = { variant?: Variant; size?: Size; className?: string; children: ReactNode }

export function Button({
  variant,
  size,
  className,
  children,
  type = 'button',
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  )
}

export function ButtonLink({
  to,
  variant,
  size,
  className,
  children,
  external = false,
}: CommonProps & { to: string; external?: boolean }) {
  if (external) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={buttonClass(variant, size, className)}>
        {children}
      </a>
    )
  }
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  )
}
