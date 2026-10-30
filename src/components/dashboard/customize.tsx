"use client"

import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, SlidersHorizontal } from "lucide-react"
import { useTranslations } from "next-intl"

import { buttonVariants } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useDashboardLayout } from "@/lib/dashboard/layout"

/** "Customise": show, hide and reorder the overview's sections. Saved on this device. */
export function DashboardCustomize() {
  const t = useTranslations("Dashboard.customize")
  const { order, hidden, toggle, move, reset } = useDashboardLayout()
  return (
    <Popover>
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <SlidersHorizontal className="size-3.5" />
        {t("button")}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-1 p-3">
        <p className="px-1 pb-1 text-sm font-semibold text-foreground">{t("title")}</p>
        <ul className="space-y-1">
          {order.map((s, i) => {
            const off = hidden.includes(s)
            return (
              <li key={s} className="flex items-center gap-1 rounded-xl px-1 py-0.5">
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  aria-pressed={!off}
                  aria-label={t(off ? "show" : "hide", { name: t(`sections.${s}`) })}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {off ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
                <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", off ? "text-muted-foreground line-through" : "text-foreground")}>{t(`sections.${s}`)}</span>
                <button type="button" disabled={i === 0} onClick={() => move(s, -1)} aria-label={t("moveUp", { name: t(`sections.${s}`) })} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30">
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" disabled={i === order.length - 1} onClick={() => move(s, 1)} aria-label={t("moveDown", { name: t(`sections.${s}`) })} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30">
                  <ArrowDown className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
        <button type="button" onClick={reset} className="mt-1 inline-flex items-center gap-1.5 self-start rounded-full px-3 py-2 text-sm font-semibold text-primary hover:bg-muted">
          <RotateCcw className="size-3.5" />
          {t("reset")}
        </button>
      </PopoverContent>
    </Popover>
  )
}
