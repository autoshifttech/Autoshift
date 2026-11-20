"use client";

import { useEffect, useRef, useState } from "react";

import { LogoMark } from "@/components/brand/logo-mark";

const TRIGGER = 72;

/**
 * Phones: pull the page down from the top to reload it (pull_2). The
 * AutoShift mark slides down with your finger, turning as it goes; past the
 * line it lights up, and on release it launches upward and the page reloads.
 * Only touch input, only when the page (and whatever you touched) is
 * scrolled to the top. Decorative to screen readers: reload is still there.
 */
export function PullToRefresh({ rootId }: { rootId: string }) {
  const [pull, setPull] = useState(0);
  const [launch, setLaunch] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root || !matchMedia("(pointer: coarse)").matches) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const atTop = (el: Element | null) => {
      for (let n = el; n && n !== root.parentElement; n = n.parentElement) {
        if (n instanceof HTMLElement && n.scrollTop > 0) return false;
      }
      return true;
    };
    const onStart = (e: TouchEvent) => {
      startY.current = e.touches.length === 1 && atTop(e.target as Element) ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const d = e.touches[0].clientY - startY.current;
      if (d <= 0) {
        if (pullRef.current) setPull((pullRef.current = 0));
        return;
      }
      // Resistance: the further you pull, the slower it follows.
      const v = Math.min(120, d * 0.5);
      pullRef.current = v;
      setPull(v);
    };
    const onEnd = () => {
      const hit = pullRef.current >= TRIGGER;
      startY.current = null;
      pullRef.current = 0;
      if (!hit) return setPull(0);
      setLaunch(true);
      window.setTimeout(() => window.location.reload(), reduce ? 0 : 450);
    };
    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: true });
    root.addEventListener("touchend", onEnd, { passive: true });
    root.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onEnd);
    };
  }, [rootId]);

  if (!pull && !launch) return null;
  const ready = pull >= TRIGGER;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center">
      <div
        className={launch ? "ptr-launch" : "transition-[translate] duration-200"}
        style={launch ? undefined : { translate: `0 ${pull - 40}px` }}
      >
        <div
          className="flex size-11 items-center justify-center rounded-full bg-card shadow-[var(--shadow-card)] ring-1 ring-border"
          style={{ rotate: launch ? "0deg" : `${(pull / TRIGGER) * 180 - 180}deg`, boxShadow: ready ? "0 0 0 4px color-mix(in oklab, var(--primary) 25%, transparent)" : undefined }}
        >
          <LogoMark className="size-7" />
        </div>
      </div>
    </div>
  );
}
