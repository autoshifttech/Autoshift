"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"

/** Localised "Close" text for the built-in close buttons. */
function CloseLabel() {
  const t = useTranslations("UiPrimitives")
  return <>{t("close")}</>
}

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-background/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

/** Drag-to-close for bottom sheets: follows the finger, closes past ~90px or a quick flick, else springs back. */
function useSheetDrag(enabled: boolean) {
  const sheet = React.useRef<HTMLDivElement>(null)
  const close = React.useRef<HTMLButtonElement>(null)
  const start = React.useRef<{ y: number; t: number } | null>(null)
  const dy = React.useRef(0)
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { y: e.clientY, t: performance.now() }
    if (sheet.current) sheet.current.style.transition = "none"
  }
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current || !sheet.current) return
    dy.current = Math.max(0, e.clientY - start.current.y)
    sheet.current.style.translate = `0 ${dy.current}px`
  }
  const up = () => {
    const s = start.current
    const el = sheet.current
    start.current = null
    if (!s || !el) return
    const speed = dy.current / Math.max(1, performance.now() - s.t)
    el.style.transition = "translate 0.35s cubic-bezier(0.3, 1.3, 0.5, 1)"
    if (dy.current > 90 || speed > 0.6) {
      el.style.translate = "0 100%"
      window.setTimeout(() => close.current?.click(), 120)
    } else {
      el.style.translate = ""
    }
    window.setTimeout(() => {
      el.style.transition = ""
    }, 400)
    dy.current = 0
  }
  return { sheet, close, down, move, up }
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  const { sheet: sheetRef, close: closeRef, down: dragDown, move: dragMove, up: dragUp } = useSheetDrag(side === "bottom")
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        ref={sheetRef}
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 liquid-glass lg-frost bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          className
        )}
        {...props}
      >
        {side === "bottom" && (
          // Grab handle: drag the sheet down to close it (iOS-style).
          <div
            aria-hidden
            className="-mt-2 -mb-2 flex h-6 shrink-0 cursor-grab touch-none items-start justify-center active:cursor-grabbing"
            onPointerDown={dragDown}
            onPointerMove={dragMove}
            onPointerUp={dragUp}
            onPointerCancel={dragUp}
          >
            <span className="mt-1 h-1.5 w-10 rounded-full bg-foreground/20" />
          </div>
        )}
        {children}
        {side === "bottom" && <SheetPrimitive.Close ref={closeRef} hidden tabIndex={-1} aria-hidden />}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">
              <CloseLabel />
            </span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
