"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const TARGETS = '[data-slot="card"], section, [data-reveal]';

/**
 * Cards and sections below the fold rise in as they scroll into view.
 * `root` is the scrolling container of the page. Anything already on
 * screen is left alone (the page-entry animation covers it), and the
 * classes are removed once shown so nothing keeps a transform.
 */
export function ScrollReveal({ rootId }: { rootId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.getElementById(rootId);
    if (!root || !("IntersectionObserver" in window)) return;

    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          el.classList.add("sr-show");
          el.classList.remove("sr-hide");
          window.setTimeout(() => el.classList.remove("sr-show"), 800);
        }
      },
      { root, rootMargin: "0px 0px -6% 0px", threshold: 0.08 },
    );

    const scan = () => {
      const fold = root.getBoundingClientRect().bottom;
      root.querySelectorAll(TARGETS).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        // Only the outermost card: nested cards ride along with their parent.
        if (el.parentElement?.closest(TARGETS) && root.contains(el.parentElement.closest(TARGETS))) return;
        if (el.getBoundingClientRect().top < fold) return;
        el.classList.add("sr-hide");
        io.observe(el);
      });
    };

    const first = window.setTimeout(scan, 120);
    // Pages that load data later add cards after the first scan.
    const mo = new MutationObserver(() => scan());
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(first);
      mo.disconnect();
      io.disconnect();
      root.querySelectorAll(".sr-hide, .sr-show").forEach((el) => el.classList.remove("sr-hide", "sr-show"));
    };
  }, [pathname, rootId]);

  return null;
}
