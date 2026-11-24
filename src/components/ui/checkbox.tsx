"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"
import { TickArt } from "./tick-box"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn("peer cursor-pointer outline-none disabled:cursor-not-allowed", className)}
      {...props}
    >
      {/* The animated tick box (see TickArt): drawn in every state, ticked by data-checked. */}
      <TickArt />
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
