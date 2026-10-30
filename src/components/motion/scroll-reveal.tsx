"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const TARGETS = '[data-slot="card"], section, [data-reveal]';

/**
 * Cards and sections below the fold rise in as they scroll into view.
 * `rootId` is the scrolling container of the page.
 *
 * Uses the Web Animations API when an element enters view, so it never
 * writes a class or attribute onto markup React owns (doing that before a
 * section finished hydrating caused hydration warnings). Anything already
 * on screen is left alone; the page-entry animation covers it.
 */
export function ScrollReveal({ rootId }: { rootId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.getElementById(rootId);
    if (!root || !("IntersectionObserver" in window)) return;

    const watched = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          e.target.animate(
            [
              { opacity: 0, transform: "translateY(28px) scale(0.985)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 700, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards" },
          );
        }
      },
      { root, rootMargin: "0px 0px -4% 0px", threshold: 0 },
    );

    const scan = () => {
      const fold = root.getBoundingClientRect().bottom;
      root.querySelectorAll(TARGETS).forEach((el) => {
        if (watched.has(el)) return;
        watched.add(el);
        // Only the outermost card: nested cards ride along with their parent.
        const outer = el.parentElement?.closest(TARGETS);
        if (outer && root.contains(outer)) return;
        // On screen already: the page-entry animation handles it.
        if (el.getBoundingClientRect().top < fold) return;
        io.observe(el);
      });
    };

    const first = window.setTimeout(scan, 120);
    // Pages that load their data later add cards after the first scan.
    const mo = new MutationObserver(() => scan());
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(first);
      mo.disconnect();
      io.disconnect();
    };
  }, [pathname, rootId]);

  return null;
}
