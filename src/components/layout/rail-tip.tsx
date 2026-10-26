"use client";

import { useEffect, useState } from "react";

/**
 * Hover names for the dark rail. Drawn in a fixed layer instead of a CSS
 * ::after so a scrolling rail can't cut them off. Reads `data-tip` from
 * any `.rail-tip` element under the pointer or keyboard focus.
 */
export function RailTip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const show = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest(".rail-tip[data-tip]") : null;
      if (!el) return setTip(null);
      const r = el.getBoundingClientRect();
      setTip({ text: el.getAttribute("data-tip") ?? "", x: r.right + 12, y: r.top + r.height / 2 });
    };
    const hide = () => setTip(null);
    document.addEventListener("mouseover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("focusout", hide);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("mouseover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[70] hidden -translate-y-1/2 rounded-lg bg-[#1a1d1b] px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-white shadow-lg lg:block"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>
  );
}
