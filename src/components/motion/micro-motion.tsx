"use client";

import { useEffect } from "react";

/**
 * App-wide micro-interactions that need a pointer position or an event,
 * styled in globals.css ("Micro-interactions"):
 *
 * - Ripple: pressing a button spreads a soft wave from the finger/cursor.
 * - Copied: any button that copies to the clipboard flashes green and pops,
 *   without each copy button having to opt in (we watch clipboard writes).
 * - Tilt: clickable cards and stat tiles lean toward the mouse in 3D.
 * - Magnetic: green buttons drift a few pixels toward the cursor.
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

    // Desktop mouse only: cards tilt toward the cursor in 3D, and green
    // buttons lean slightly toward it ("magnetic"). One listener, one frame.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let tilted: HTMLElement | null = null;
    let pulled: HTMLElement | null = null;
    let raf = 0;
    let px = 0;
    let py = 0;
    const tiltOf = (t: Element | null) => {
      if (!t?.closest) return null;
      const direct = t.closest<HTMLElement>('[data-tilt], a[data-slot="card"], button[data-slot="card"]');
      if (direct) return direct;
      const a = t.closest("a");
      return a?.querySelector<HTMLElement>(':scope > [data-slot="card"]:only-child') ?? null;
    };
    const release = (el: HTMLElement | null, kind: "tilt" | "pull") => {
      if (!el) return;
      el.removeAttribute(kind === "tilt" ? "data-tilting" : "data-pulling");
      el.style.removeProperty(kind === "tilt" ? "--tilt-x" : "--pull-x");
      el.style.removeProperty(kind === "tilt" ? "--tilt-y" : "--pull-y");
    };
    const paint = () => {
      raf = 0;
      if (tilted) {
        const r = tilted.getBoundingClientRect();
        const nx = (px - r.left) / r.width - 0.5;
        const ny = (py - r.top) / r.height - 0.5;
        // Bigger cards tilt less, so wide panels never swing.
        const max = Math.max(1.5, Math.min(6, 2400 / Math.max(r.width, r.height) / 10));
        tilted.style.setProperty("--tilt-x", `${(-ny * max).toFixed(2)}deg`);
        tilted.style.setProperty("--tilt-y", `${(nx * max).toFixed(2)}deg`);
      }
      if (pulled) {
        const r = pulled.getBoundingClientRect();
        const dx = px - (r.left + r.width / 2);
        const dy = py - (r.top + r.height / 2);
        pulled.style.setProperty("--pull-x", `${Math.max(-4, Math.min(4, dx * 0.12)).toFixed(1)}px`);
        pulled.style.setProperty("--pull-y", `${Math.max(-3, Math.min(3, dy * 0.2)).toFixed(1)}px`);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      // Only inside the business app and the admin panel.
      const raw = e.target as Element | null;
      const t = raw?.closest?.("#app-scroll, #admin-scroll") ? raw : null;
      const card = tiltOf(t);
      if (card !== tilted) {
        release(tilted, "tilt");
        tilted = card;
        tilted?.setAttribute("data-tilting", "");
      }
      const btn = t?.closest?.<HTMLElement>('[data-slot="button"].bg-primary:not(:disabled)') ?? null;
      if (btn !== pulled) {
        release(pulled, "pull");
        pulled = btn;
        pulled?.setAttribute("data-pulling", "");
      }
      px = e.clientX;
      py = e.clientY;
      if ((tilted || pulled) && !raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      release(tilted, "tilt");
      release(pulled, "pull");
      tilted = pulled = null;
    };
    if (fine) {
      document.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
    }

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
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      if (clip && original) clip.writeText = original;
    };
  }, []);

  return null;
}
