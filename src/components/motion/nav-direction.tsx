"use client";

import { useEffect } from "react";

/**
 * Tells the page transition which way to move (direction-aware slides, like
 * iOS): it sets <html data-nav-dir="forward|back"> just before a navigation,
 * and the CSS in globals.css slides the new page in from that side.
 *
 * - A link further down the same menu (rail, phone bar, admin menu) is
 *   "forward"; one further up is "back".
 * - Going deeper (/contacts -> /contacts/123) is forward; going to a parent
 *   page, or a link marked as a back link, is back.
 * - The browser's Back button is back.
 * Anything else keeps the plain fade.
 */
export function NavDirection() {
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    const set = (dir: "forward" | "back" | null) => {
      window.clearTimeout(timer);
      if (!dir) return void delete root.dataset.navDir;
      root.dataset.navDir = dir;
      // Long enough for the transition to start; then forget it.
      timer = window.setTimeout(() => delete root.dataset.navDir, 1200);
    };
    const strip = (p: string) => p.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href^='/']");
      if (!a || a.target === "_blank") return;
      const to = strip(a.getAttribute("href") ?? "");
      const from = strip(location.pathname);
      if (to === from) return set(null);

      const nav = a.closest("nav, [data-nav-list], [role='navigation']");
      if (nav) {
        const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>("a[href^='/']"));
        const cur = links.findIndex((l) => l.getAttribute("aria-current") === "page");
        const next = links.indexOf(a);
        if (cur >= 0 && next >= 0 && cur !== next) return set(next > cur ? "forward" : "back");
      }
      const label = `${a.getAttribute("aria-label") ?? ""} ${a.dataset.navBack ?? ""}`.toLowerCase();
      if (a.dataset.navBack !== undefined || /\bback\b/.test(label)) return set("back");
      if (to.startsWith(from + "/")) return set("forward");
      if (from.startsWith(to + "/")) return set("back");
      set(null);
    };
    const onPop = () => set("back");
    // Code navigation (router.push from a table row) has no link to read:
    // judge it by the paths, deeper is forward.
    const push = history.pushState.bind(history);
    history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
      if (url && !root.dataset.navDir) {
        const to = strip(new URL(String(url), location.href).pathname);
        const from = strip(location.pathname);
        if (to.startsWith(from + "/")) set("forward");
        else if (from.startsWith(to + "/")) set("back");
      }
      return push(data, unused, url);
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      history.pushState = push;
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
