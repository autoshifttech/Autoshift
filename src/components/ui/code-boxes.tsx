import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Shows a one-time code as separate boxes (keypad_1, signup): each digit pops
 * into its box, the next box glows, all boxes turn green when the code is
 * complete, and they shake when `error` changes to a message.
 *
 * The real field is the single <Input> passed as children (so paste, SMS
 * autofill and screen readers work as before); it sits invisibly on top.
 * Give that input the class `code-boxes-input`.
 */
export function CodeBoxes({ value, length, error, children }: { value: string; length: number; error?: string | null; children: ReactNode }) {
  const active = Math.min(value.length, length - 1);
  const done = value.length === length;
  return (
    <div className="code-boxes relative">
      {children}
      <div key={error || "ok"} aria-hidden className={cn("pointer-events-none grid gap-2", error && "code-shake")} style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            data-active={!done && i === active ? "" : undefined}
            data-filled={value[i] ? "" : undefined}
            data-done={done ? "" : undefined}
            data-error={error ? "" : undefined}
            className="code-box flex h-12 items-center justify-center rounded-xl border border-input bg-card font-mono text-xl font-semibold text-foreground dark:bg-input/30"
          >
            {value[i] ? <span key={value[i] + i} className="code-digit">{value[i]}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}
