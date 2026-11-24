"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The one "back" control: a soft pill with the arrow in a tinted circle. On hover the circle
 * fills with the brand green and the arrow nudges left; it lifts a touch; keyboard focus shows
 * a ring; phones get a 44px tap height. `iconOnly` is the round version for tight headers
 * (give it a `label`, read out by screen readers). Give it `href` for a link or `onClick`.
 */
type Common = {
  children?: React.ReactNode
  className?: string
  /** The round, arrow-only version. `label` is then required. */
  iconOnly?: boolean
  /** Accessible name when there is no visible text (iconOnly). */
  label?: string
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "className" | "onClick">

type BackLinkProps = Common & ({ href: string; onClick?: never } | { href?: never; onClick: () => void })

const pill =
  "group/back inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card/85 py-1 pr-4 pl-1 text-sm font-semibold text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_16px_-10px_rgb(0_0_0/0.22)] backdrop-blur transition-[transform,box-shadow,border-color] duration-200 hover:border-primary/30 hover:shadow-[0_2px_4px_rgb(0_0_0/0.05),0_10px_22px_-10px_color-mix(in_oklab,var(--primary)_40%,transparent)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-safe:hover:-translate-y-px sm:min-h-10"
const round =
  "group/back inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:size-10"
const dot =
  "flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors duration-200 group-hover/back:bg-primary group-hover/back:text-primary-foreground"

export function BackLink({ href, onClick, children, className, iconOnly, label, ...rest }: BackLinkProps) {
  const inner = (
    <>
      <span aria-hidden className={dot}>
        <ArrowLeft className="size-4 transition-transform duration-200 motion-safe:group-hover/back:-translate-x-0.5" />
      </span>
      {!iconOnly && <span className="min-w-0 truncate">{children}</span>}
    </>
  )
  const cls = cn(iconOnly ? round : pill, className)
  const a11y = iconOnly ? { "aria-label": label } : label ? { "aria-label": label } : {}
  if (href !== undefined) {
    return (
      <Link href={href} className={cls} {...a11y} {...rest}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls} {...a11y} {...rest}>
      {inner}
    </button>
  )
}
