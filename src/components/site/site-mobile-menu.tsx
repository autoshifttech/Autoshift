"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Phone menu for the app-rendered public pages: the three lines fold into
 * an X (menu_1) and the links drop in one after another (menu_3).
 * The public site is English-only, like the rest of site-chrome.
 */
export function SiteMobileMenu({ items }: { items: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const all = [...items, { label: "Sign in", href: "/login" }];
  return (
    <div ref={box} className="relative lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="site-mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="flex size-11 items-center justify-center rounded-full text-foreground hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="burger" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </button>
      {open && (
        <nav
          id="site-mobile-nav"
          aria-label="Main"
          className="menu-drop absolute top-[calc(100%+10px)] right-0 z-50 grid w-60 gap-0.5 rounded-3xl bg-card p-2 text-foreground shadow-[0_18px_40px_-12px_rgb(0_0_0/0.25)] ring-1 ring-border"
        >
          {all.map((item, i) =>
            item.href.startsWith("/#") ? (
              <a key={item.href} href={item.href} style={{ ["--i" as string]: i }} onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-2xl px-4 text-[15px] font-medium hover:bg-foreground/5">
                {item.label}
              </a>
            ) : (
              <Link key={item.href} href={item.href} style={{ ["--i" as string]: i }} onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-2xl px-4 text-[15px] font-medium hover:bg-foreground/5">
                {item.label}
              </Link>
            ),
          )}
        </nav>
      )}
    </div>
  );
}
