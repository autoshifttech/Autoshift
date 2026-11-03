"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Height that fills what is left of the scrolling app page below an element's
 * top edge, so a full-height editor scrolls inside itself instead of running
 * off the screen. Attach `ref` to the wrapper and give it `style={{ height }}`.
 */
export function useFitHeight<T extends HTMLElement>(min = 420) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      const scroller = document.getElementById("app-scroll");
      if (!el || !scroller) return;
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const main = el.closest("main");
      const pb = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      setHeight(Math.max(min, scroller.clientHeight - top - pb));
    };
    fit();
    const scroller = document.getElementById("app-scroll");
    const ro = new ResizeObserver(fit);
    if (scroller) ro.observe(scroller);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [min]);
  return { ref, height };
}
