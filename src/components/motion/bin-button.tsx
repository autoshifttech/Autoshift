"use client";

import { useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * "The bin eats the label" delete button. On click: the lid flips open, the
 * letters hop into the bin one by one (it fills up), the lid shuts, the button
 * folds into a round bin and a ring draws around it; then `onDone` runs (the
 * real delete). With reduced motion it simply runs `onDone`.
 */
export function BinButton({ label, onDone, className, autoFocus }: { label: string; onDone: () => void; className?: string; autoFocus?: boolean }) {
  const [phase, setPhase] = useState<"idle" | "eat" | "fold" | "ring">("idle");
  const btn = useRef<HTMLButtonElement>(null);
  const bin = useRef<SVGSVGElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const clip = `bin-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const run = () => {
    if (phase !== "idle") return;
    const b = btn.current;
    const target = bin.current?.getBoundingClientRect();
    if (!b || !target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onDone();
    setPhase("eat");
    const letters = Array.from(word.current?.querySelectorAll<HTMLSpanElement>("[data-l]") ?? []);
    const into = { x: target.left + target.width / 2, y: target.top + target.height * 0.35 };
    const gap = 70;
    const hop = 380;
    letters.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const dx = into.x - (r.left + r.width / 2);
      const dy = into.y - (r.top + r.height / 2);
      el.animate(
        [
          { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 },
          { transform: `translate(${dx * 0.55}px, ${dy - 18}px) rotate(-120deg) scale(0.85)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${dx}px, ${dy}px) rotate(-200deg) scale(0.3)`, opacity: 0 },
        ],
        { duration: hop, delay: i * gap, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "forwards" },
      );
    });
    const eaten = letters.length * gap + hop;
    window.setTimeout(() => {
      // Fold into a circle the height of the button.
      setPhase("fold");
      const w = b.offsetWidth;
      const h = b.offsetHeight;
      b.animate([{ width: `${w}px` }, { width: `${h}px` }], { duration: 300, easing: "cubic-bezier(0.5, 0, 0.2, 1)", fill: "forwards" });
    }, eaten);
    window.setTimeout(() => setPhase("ring"), eaten + 300);
    window.setTimeout(onDone, eaten + 300 + 620);
  };

  return (
    <span className="relative inline-flex">
      <button
        ref={btn}
        type="button"
        autoFocus={autoFocus}
        onClick={run}
        data-phase={phase}
        aria-busy={phase !== "idle" || undefined}
        className={cn(
          "bin-button relative inline-flex h-9 items-center justify-center gap-1.5 overflow-hidden rounded-full bg-destructive px-4 text-sm font-semibold text-white shadow-[0_6px_16px_-8px_var(--destructive)] outline-none select-none focus-visible:ring-3 focus-visible:ring-destructive/40 disabled:opacity-50",
          className,
        )}
      >
        <svg ref={bin} viewBox="0 0 24 24" aria-hidden className="bin-icon size-[18px] shrink-0 overflow-visible" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <g className="bin-lid">
            <path d="M3.5 6h17" />
            <path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" />
          </g>
          <clipPath id={clip}>
            <path d="M5.5 6.5 6.6 20a1.5 1.5 0 0 0 1.5 1.4h7.8a1.5 1.5 0 0 0 1.5-1.4L18.5 6.5Z" />
          </clipPath>
          <rect className="bin-fill" x="5" y="6" width="14" height="16" fill="currentColor" stroke="none" clipPath={`url(#${clip})`} />
          <path d="M5.5 6.5 6.6 20a1.5 1.5 0 0 0 1.5 1.4h7.8a1.5 1.5 0 0 0 1.5-1.4L18.5 6.5" />
        </svg>
        <span ref={word} className="bin-word inline-block overflow-hidden whitespace-nowrap" aria-label={label}>
          {Array.from(label).map((ch, i) => (
            <span key={i} data-l aria-hidden className="inline-block">
              {ch === " " ? " " : ch}
            </span>
          ))}
        </span>
      </button>
      {phase === "ring" && (
        <svg aria-hidden viewBox="0 0 48 48" className="bin-ring pointer-events-none absolute top-1/2 left-0 size-[52px] -translate-x-2 -translate-y-1/2 text-destructive">
          <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
          <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" pathLength="1" transform="rotate(-90 24 24)" />
        </svg>
      )}
    </span>
  );
}
