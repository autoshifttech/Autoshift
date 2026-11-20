"use client";

import { useEffect } from "react";

/**
 * Smooth, gliding scrolling for desktop mouse wheels and the keyboard:
 * each wheel step sets a target and the page eases toward it, so scrolling
 * down and back up feels continuous instead of jumping in steps.
 *
 * `rootId` is the scrolling element; leave it out when the window scrolls.
 * Off for touch screens (they already glide), reduced motion, zoom gestures
 * (Ctrl/Cmd + wheel), sideways scrolling, and anything inside its own
 * scroll area (chat threads, menus, dialogs, text boxes).
 */
export function SmoothScroll({ rootId }: { rootId?: string }) {
  useEffect(() => {
    if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = rootId ? document.getElementById(rootId) : null;
    if (rootId && !box) return;
    const scroller = box ?? document.scrollingElement ?? document.documentElement;
    const listenOn: HTMLElement | Window = box ?? window;

    let target = 0;
    let cur = 0;
    let raf = 0;
    let active = false;

    const max = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      active = false;
    };
    const locked = () => {
      const h = getComputedStyle(document.documentElement).overflow;
      const b = getComputedStyle(document.body).overflow;
      return h === "hidden" || b === "hidden";
    };
    const ownScroller = (el: Element | null) => {
      for (let n = el; n && n !== scroller && n !== document.body; n = n.parentElement) {
        if (n.matches("textarea, select, [contenteditable='true'], [role='dialog'], [role='menu'], [role='listbox']")) return true;
        const s = getComputedStyle(n);
        if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return true;
      }
      return false;
    };
    // Frame-rate independent easing, so 60 Hz and 120 Hz screens glide the same.
    let last = 0;
    const step = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 16.7;
      last = now;
      cur += (target - cur) * (1 - Math.pow(1 - 0.1, dt / 16.7));
      if (Math.abs(target - cur) < 0.5) cur = target;
      scroller.scrollTo({ top: cur, behavior: "instant" });
      if (cur !== target) raf = requestAnimationFrame(step);
      else stop();
    };
    const glideBy = (dy: number, absolute?: number) => {
      if (!active) {
        cur = scroller.scrollTop;
        target = cur;
        active = true;
        last = 0;
      }
      target = Math.min(max(), Math.max(0, absolute ?? target + dy));
      if (!raf) raf = requestAnimationFrame(step);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (locked() || ownScroller(e.target as Element)) return;
      e.preventDefault();
      glideBy(e.deltaMode === 1 ? e.deltaY * 36 : e.deltaMode === 2 ? e.deltaY * scroller.clientHeight : e.deltaY);
    };
    // Keyboard scrolling glides too (Page Up/Down, Space, Home/End, arrows),
    // unless you are typing or inside something with its own keys.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || locked()) return stop();
      if (t && (t.isContentEditable || t.closest("input, textarea, select, button, [role='slider'], [role='tab'], [role='menu'], [role='listbox'], [role='grid'], [role='dialog']"))) return stop();
      if (t && t !== document.body && !scroller.contains(t)) return stop();
      const page = scroller.clientHeight * 0.85;
      const keys: Record<string, () => void> = {
        PageDown: () => glideBy(page),
        PageUp: () => glideBy(-page),
        " ": () => glideBy(e.shiftKey ? -page : page),
        ArrowDown: () => glideBy(90),
        ArrowUp: () => glideBy(-90),
        Home: () => glideBy(0, 0),
        End: () => glideBy(0, max()),
      };
      const run = keys[e.key];
      if (!run) return stop();
      e.preventDefault();
      run();
    };

    listenOn.addEventListener("wheel", onWheel as EventListener, { passive: false });
    window.addEventListener("keydown", onKey);
    // Clicks on the scrollbar and touch take over at once.
    const kinds = ["mousedown", "touchstart"] as const;
    kinds.forEach((k) => window.addEventListener(k, stop, { passive: true }));
    return () => {
      stop();
      listenOn.removeEventListener("wheel", onWheel as EventListener);
      window.removeEventListener("keydown", onKey);
      kinds.forEach((k) => window.removeEventListener(k, stop));
    };
  }, [rootId]);

  return null;
}
