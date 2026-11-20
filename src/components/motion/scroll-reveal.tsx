"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const TARGETS = '[data-slot="card"], section, [data-reveal]';

/**
 * Cards and sections rise in as they scroll into view, and drop in from
 * above when you scroll back up to them.
 * `rootId` is the scrolling container of the page; leave it out when the
 * window itself scrolls (the public site pages).
 *
 * Uses the Web Animations API when an element enters view, so it never
 * writes a class or attribute onto markup React owns (doing that before a
 * section finished hydrating caused hydration warnings). Anything already
 * on screen is left alone; the page-entry animation covers it.
 */
export function ScrollReveal({ rootId }: { rootId?: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = rootId ? document.getElementById(rootId) : null;
    const root = rootId ? box : document.getElementById("main");
    if (!root || !("IntersectionObserver" in window)) return;

    const watched = new WeakSet<Element>();
    // Elements currently "in"; leaving the view resets them so they can
    // animate again, from below when scrolling down and from above when
    // scrolling back up.
    const shown = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) {
            shown.delete(e.target);
            continue;
          }
          if (shown.has(e.target)) continue;
          shown.add(e.target);
          const top = e.rootBounds ? e.rootBounds.top : 0;
          const fromAbove = e.boundingClientRect.top < top + 1;
          e.target.animate(
            [
              { opacity: 0, transform: `translateY(${fromAbove ? -28 : 28}px) scale(0.985)` },
              { opacity: 1, transform: "none" },
            ],
            { duration: 700, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards" },
          );
        }
      },
      { root: box, rootMargin: "0px", threshold: 0 },
    );

    // Inside the app and admin: cards sink back and fade a little as they
    // leave over the top, tied to the scroll position (scroll-driven, so it
    // follows the finger exactly). Only cards shorter than ~2/3 of the view,
    // so long tables you are reading never move. Browsers without view
    // timelines skip it.
    type ViewTimelineCtor = new (o: { subject: Element; axis?: string }) => AnimationTimeline;
    const VT = (window as unknown as { ViewTimeline?: ViewTimelineCtor }).ViewTimeline;
    const depth = (el: Element) => {
      if (!box || !VT) return;
      if ((el as HTMLElement).offsetHeight > box.clientHeight * 0.66) return;
      el.animate([{ transform: "none", opacity: 1 }, { transform: "scale(0.94)", opacity: 0.3 }], {
        timeline: new VT({ subject: el, axis: "block" }),
        rangeStart: "exit 0%",
        rangeEnd: "exit 100%",
        fill: "none",
        easing: "cubic-bezier(0.4, 0, 1, 1)",
      } as KeyframeAnimationOptions);
    };

    const scan = () => {
      const fold = box ? box.getBoundingClientRect().bottom : window.innerHeight;
      root.querySelectorAll(TARGETS).forEach((el) => {
        if (watched.has(el)) return;
        watched.add(el);
        // Only the outermost card: nested cards ride along with their parent.
        const outer = el.parentElement?.closest(TARGETS);
        if (outer && root.contains(outer)) return;
        // On screen already: the page-entry animation handles it this time.
        if (el.getBoundingClientRect().top < fold) shown.add(el);
        io.observe(el);
        depth(el);
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
