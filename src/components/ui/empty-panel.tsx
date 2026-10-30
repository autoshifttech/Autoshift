import type { ComponentType, ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The one empty state used across the app: an icon on layered soft
 * rings, a title, one line of help and an optional action. Pass
 * `heading` when the page has no heading nearby for it to sit under.
 */
export function EmptyPanel({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      <span aria-hidden className="relative flex size-20 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-primary/[0.06]" />
        <span className="absolute inset-3 rounded-full bg-primary/10" />
        <span className="relative flex size-11 items-center justify-center rounded-full bg-card text-primary shadow-[var(--shadow-card)] ring-1 ring-border">
          <Icon className="size-5" />
        </span>
      </span>
      <p className="mt-4 text-base font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  )
}
