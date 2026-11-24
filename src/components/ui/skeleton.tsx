import { cn } from "@/lib/utils"

/** A placeholder block that shimmers while content loads (still when motion is reduced). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden data-slot="skeleton" className={cn("skeleton rounded-xl", className)} {...props} />
}

/** The shape of a typical page: a stat row, a wide card and a side card. */
function PageSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="space-y-4">
      <Skeleton className="h-5 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  )
}

/** Rows for a list column such as the conversation list, or any panel still loading its list.
 *  `label` is what screen readers hear (pass the page's own translated "Loading…"). */
function ListSkeleton({ rows = 6, label = "Loading", className, compact }: { rows?: number; label?: string; className?: string; compact?: boolean }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cn("space-y-1 p-3", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl p-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-backwards motion-safe:duration-500"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <Skeleton className={cn("shrink-0 rounded-full", compact ? "size-8" : "size-10")} />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5" style={{ width: `${[42, 55, 35, 48, 60, 38][i % 6]}%` }} />
            <Skeleton className="h-3" style={{ width: `${[78, 64, 82, 70, 58, 74][i % 6]}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export { Skeleton, PageSkeleton, ListSkeleton }
