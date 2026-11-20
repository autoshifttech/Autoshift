"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * iOS-style large title: once the page's big title (the first h1 in the
 * scroll area) scrolls out of view, a compact glass bar with the same title
 * slides down at the top; scrolling back up hands the title back.
 * Tapping the bar glides to the top. Navigation layer, so glass is allowed.
 */
export function CollapsingTitle({ rootId }: { rootId: string }) {
  const pathname = usePathname();
  const [title, setTitle] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root || !("IntersectionObserver" in window)) return;
    let io: IntersectionObserver | null = null;
    // Wait a frame so the new page's title is in the DOM.
    const t = window.setTimeout(() => {
      const h1 = root.querySelector("h1");
      if (!h1) return;
      setTitle(h1.textContent?.trim() ?? "");
      io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0) + 1), { root, threshold: 0 });
      io.observe(h1);
    }, 60);
    return () => {
      window.clearTimeout(t);
      io?.disconnect();
      setShow(false);
    };
  }, [pathname, rootId]);

  return (
    <div className="pointer-events-none sticky top-0 z-30 h-0">
      <button
        type="button"
        tabIndex={show ? 0 : -1}
        aria-hidden={!show}
        onClick={() => document.getElementById(rootId)?.scrollTo({ top: 0, behavior: "smooth" })}
        data-show={show || undefined}
        className="title-bar liquid-glass mx-auto mt-2 flex h-10 max-w-[min(32rem,calc(100%-2rem))] items-center justify-center truncate rounded-full px-5 text-sm font-semibold text-foreground"
      >
        {title}
      </button>
    </div>
  );
}
