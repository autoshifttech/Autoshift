"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

// Root: primary token when checked (responds to the active color theme),
// slate when unchecked.
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group/switch inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-[background-color,box-shadow] duration-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        // On: a soft green halo (switch_1).
        "data-[checked]:bg-primary data-[checked]:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_16%,transparent)] data-[unchecked]:bg-muted",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-card shadow-sm ring-0 transition-[translate,width] duration-300 ease-[cubic-bezier(0.3,1.5,0.5,1)] motion-reduce:transition-none",
          "data-[checked]:translate-x-4 data-[unchecked]:translate-x-0",
          // Pressing squishes the thumb wider toward the side it will travel (switch_1).
          "motion-safe:group-active/switch:w-5 motion-safe:group-active/switch:data-[checked]:translate-x-3",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
