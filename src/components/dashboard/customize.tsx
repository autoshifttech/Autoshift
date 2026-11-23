"use client"

import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, SlidersHorizontal } from "lucide-react"
import { useTranslations } from "next-intl"

import { buttonVariants } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { SECTION_PAGE, useDashboardLayout } from "@/lib/dashboard/layout"
import { isOn, usePages } from "@/lib/workspace/pages"

/** "Customise": show, hide and reorder the overview's sections. Saved on this device. */
export function DashboardCustomize() {
  const t = useTranslations("Dashboard.customize")
  const { order: all, hidden, toggle, move, reset } = useDashboardLayout()
  const pages = usePages()
  // Only sections for pages this business has.
  const order = all.filter((s) => isOn(pages, SECTION_PAGE[s] ?? null))
  return (
    <Popover>
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <SlidersHorizontal className="size-3.5" />
        {t("button")}
      </PopoverTrigger>
      {/* Same structure as the "New" menu: a compact list of rows. Denser glass, so the dark chart
          card under it never shows through the text. */}
      <PopoverContent align="end" className="lg-dense w-72 max-w-[calc(100vw-2rem)] gap-0 p-1">
        <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">{t("title")}</p>
        <ul>
          {order.map((s, i) => {
            const off = hidden.includes(s)
            const name = t(`sections.${s}`)
            return (
              <li key={s} className="group/row flex items-center gap-0.5 rounded-md pr-0.5 transition-colors hover:bg-foreground/8">
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  aria-pressed={!off}
                  aria-label={t(off ? "show" : "hide", { name })}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {off ? <EyeOff className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <Eye className="size-4 shrink-0" aria-hidden />}
                  <span className={cn("min-w-0 flex-1 truncate", off ? "text-muted-foreground line-through" : "text-foreground")}>{name}</span>
                </button>
                <button type="button" disabled={i === 0} onClick={() => move(s, -1)} aria-label={t("moveUp", { name })} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30">
                  <ArrowUp className="size-3.5" aria-hidden />
                </button>
                <button type="button" disabled={i === order.length - 1} onClick={() => move(s, 1)} aria-label={t("moveDown", { name })} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30">
                  <ArrowDown className="size-3.5" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
        <div className="-mx-1 my-1 h-px bg-border" />
        <button type="button" onClick={reset} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm font-medium text-primary outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring">
          <RotateCcw className="size-4" aria-hidden />
          {t("reset")}
        </button>
      </PopoverContent>
    </Popover>
  )
}
