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

/** Rows for a list column such as the conversation list. */
function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="space-y-1 p-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl p-2">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

export { Skeleton, PageSkeleton, ListSkeleton }
