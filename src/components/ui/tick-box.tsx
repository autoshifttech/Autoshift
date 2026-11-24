import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The tick box drawing (styles: "Tick box" in globals.css). Ticking it runs one dark stroke
 * all the way around the box and on into the tick, which then settles; unticking draws back.
 * Shared by TickBox (a plain checkbox) and the Checkbox component.
 */
export function TickArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cn("tick-box-art", className)}>
      <path className="tb-base" d="M21 8V16A5 5 0 0 1 16 21H8A5 5 0 0 1 3 16V8A5 5 0 0 1 8 3H16A5 5 0 0 1 21 8" />
      <path className="tb-ring" pathLength={100} d="M21 8V16A5 5 0 0 1 16 21H8A5 5 0 0 1 3 16V8A5 5 0 0 1 8 3H16A5 5 0 0 1 21 8" />
      <path className="tb-tick" pathLength={100} d="M16.8 8.6 10.4 15 7.2 11.8" />
      <path className="tb-dash" pathLength={100} d="M7.5 12h9" />
    </svg>
  )
}

/**
 * A plain checkbox with the animated tick box. Same props and behaviour as
 * <input type="checkbox">: the real input sits invisibly on top, so clicks,
 * keyboard, forms and screen readers work exactly as before.
 */
export function TickBox({ className, style, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <span className={cn("tick-box", className)} style={style}>
      <input type="checkbox" {...props} className="tick-box-input" />
      <TickArt />
    </span>
  )
}
