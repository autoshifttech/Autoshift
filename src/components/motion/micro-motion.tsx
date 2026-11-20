"use client";

import { useEffect } from "react";

/**
 * App-wide micro-interactions that need a pointer position or an event,
 * styled in globals.css ("Micro-interactions"):
 *
 * - Ripple: pressing a button spreads a soft wave from the finger/cursor.
 * - Copied: any button that copies to the clipboard flashes green and pops,
 *   without each copy button having to opt in (we watch clipboard writes).
 *
 * Only data-* attributes and CSS variables are touched, never children, so
 * React-owned markup stays as React rendered it. Nothing runs when the
 * system asks for reduced motion.
 */
export function MicroMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers = new WeakMap<Element, number>();

    const flag = (el: HTMLElement, name: string, ms: number) => {
      el.removeAttribute(name);
      void el.offsetWidth; // restart the CSS animation
      el.setAttribute(name, "");
      window.clearTimeout(timers.get(el));
      timers.set(el, window.setTimeout(() => el.removeAttribute(name), ms));
    };

    let lastPressed: HTMLElement | null = null;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      const btn = t?.closest?.<HTMLElement>('[data-slot="button"], [data-slot="tabs-trigger"], [data-ripple-host]');
      lastPressed = (t?.closest?.("button, a, [role='button']") as HTMLElement | null) ?? null;
      if (!btn || btn.matches(":disabled, [aria-disabled='true']")) return;
      const r = btn.getBoundingClientRect();
      btn.style.setProperty("--rx", `${e.clientX - r.left}px`);
      btn.style.setProperty("--ry", `${e.clientY - r.top}px`);
      btn.style.setProperty("--rmax", `${Math.hypot(r.width, r.height)}px`);
      flag(btn, "data-ripple", 650);
    };
    document.addEventListener("pointerdown", onDown, { passive: true });

    // Copy feedback: wrap the clipboard once, mark the button that asked.
    const clip = navigator.clipboard;
    const original = clip?.writeText?.bind(clip);
    if (clip && original) {
      clip.writeText = (text: string) =>
        original(text).then((v) => {
          const host =
            (document.activeElement?.closest?.("button, [role='button']") as HTMLElement | null) ??
            (lastPressed && document.contains(lastPressed) ? lastPressed : null);
          if (host) flag(host, "data-copied", 1500);
          return v;
        });
    }

    return () => {
      document.removeEventListener("pointerdown", onDown);
      if (clip && original) clip.writeText = original;
    };
  }, []);

  return null;
}
