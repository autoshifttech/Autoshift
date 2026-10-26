import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A number whose digits roll into place like an odometer, on first show
 * and whenever the value changes (e.g. monthly → yearly price). Anything
 * that isn't a plain string renders unchanged.
 */
export function RollingNumber({ children, className }: { children: ReactNode; className?: string }) {
  if (typeof children !== "string" && typeof children !== "number") return <>{children}</>;
  const text = String(children);
  let digitIndex = 0;
  return (
    <span className={cn("roll-num", className)} aria-label={text} role="text">
      {Array.from(text).map((ch, i) => {
        if (!/[0-9]/.test(ch)) {
          return (
            <span key={i} aria-hidden>
              {ch}
            </span>
          );
        }
        const delay = digitIndex++ * 60;
        return (
          <span key={i} aria-hidden className="roll-col">
            <span className="roll-strip" style={{ transform: `translateY(-${Number(ch) * 10}%)`, animationDelay: `${delay}ms`, transitionDelay: `${delay}ms` }}>
              {"0123456789".split("").map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
