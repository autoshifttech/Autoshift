"use client";

import { useEffect } from "react";

/**
 * Smooth, gliding wheel scrolling (desktop mouse/trackpad wheels only):
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
    const step = () => {
      cur += (target - cur) * 0.12;
      if (Math.abs(target - cur) < 0.5) cur = target;
      scroller.scrollTo({ top: cur, behavior: "instant" });
      if (cur !== target) raf = requestAnimationFrame(step);
      else stop();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (locked() || ownScroller(e.target as Element)) return;
      e.preventDefault();
      if (!active) {
        cur = scroller.scrollTop;
        target = cur;
        active = true;
      }
      const dy = e.deltaMode === 1 ? e.deltaY * 36 : e.deltaMode === 2 ? e.deltaY * scroller.clientHeight : e.deltaY;
      target = Math.min(max(), Math.max(0, target + dy));
      if (!raf) raf = requestAnimationFrame(step);
    };

    listenOn.addEventListener("wheel", onWheel as EventListener, { passive: false });
    // Keyboard, clicks on the scrollbar and touch take over at once.
    const kinds = ["keydown", "mousedown", "touchstart"] as const;
    kinds.forEach((k) => window.addEventListener(k, stop, { passive: true }));
    return () => {
      stop();
      listenOn.removeEventListener("wheel", onWheel as EventListener);
      kinds.forEach((k) => window.removeEventListener(k, stop));
    };
  }, [rootId]);

  return null;
}
