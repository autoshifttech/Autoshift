"use client";

import type { ReactNode } from "react";
import { Check, Lightbulb } from "lucide-react";

import { cn } from "@/lib/utils";
import { vendorLabel, type VendorId } from "@/lib/ai/catalog";
import { VendorLogo } from "./vendor-logos";

/** Row of provider cards; the chosen one shows a check. */
export function ProviderCards({
  vendors,
  value,
  onChange,
  badge,
}: {
  vendors: VendorId[];
  value: VendorId;
  onChange: (v: VendorId) => void;
  /** Optional small status under the name (admin: "Key saved"). */
  badge?: (v: VendorId) => ReactNode;
}) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2.5">
      {vendors.map((v) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={cn(
              "relative flex min-h-12 items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              on ? "border-primary bg-primary/5" : "border-transparent bg-muted hover:bg-muted/70",
            )}
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-card text-foreground shadow-sm">
              <VendorLogo vendor={v} className="size-4" />
            </span>
            <span className="flex flex-col items-start leading-tight">
              {vendorLabel(v)}
              {badge?.(v)}
            </span>
            {on && (
              <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
                <Check className="size-3" aria-hidden />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Wrapping chips for a provider's models. */
export function ModelChips({
  models,
  value,
  onChange,
  chipExtra,
}: {
  models: { id: string; label: string; on?: boolean }[];
  value?: string;
  onChange: (id: string) => void;
  chipExtra?: (id: string) => ReactNode;
}) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {models.map((m) => {
        const picked = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={picked}
            onClick={() => onChange(m.id)}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              picked ? "border-primary bg-primary/5 text-foreground" : "border-transparent bg-muted text-foreground hover:bg-muted/70",
              m.on === false && "opacity-55",
            )}
          >
            {m.label}
            {chipExtra?.(m.id)}
          </button>
        );
      })}
    </div>
  );
}

/** The amber tip under the chips. */
export function TipBox({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-900 dark:text-amber-200">
      <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
