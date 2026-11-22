"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { LogoMark } from "@/components/brand/logo-mark";

/**
 * Shared by the business sidebar and the admin sidebar: a 60px icon rail that
 * opens into a compact menu while hovered or focused (styles: "rail-shell" in
 * globals.css). A pin keeps it open; each sidebar remembers its own pin.
 */

/** One row: the icon never moves, the name slides out beside it. */
export const railRow =
  "relative flex h-8 w-full shrink-0 items-center gap-2.5 rounded-full px-[11px] opacity-85 transition-[opacity,background-color,color,box-shadow] duration-200 hover:bg-foreground/[0.06] hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:shrink-0 [&_svg]:[stroke-width:1.5]";
export const railActive = "rail-active opacity-100";
export const railLabel = "rail-label flex-1 truncate text-[13.5px] font-medium tracking-[-0.01em]";

export function useRailOpen(pinKey: string) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timer = useRef(0);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(pinKey) === "1") setPinned(true);
    } catch {}
    return () => window.clearTimeout(timer.current);
  }, [pinKey]);

  // A short delay both ways, so brushing past the rail doesn't flap it.
  const later = (next: boolean, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHovered(next), ms);
  };
  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    if (!next) setHovered(false);
    try {
      localStorage.setItem(pinKey, next ? "1" : "0");
    } catch {}
  };
  const handlers = {
    onPointerEnter: (e: PointerEvent) => e.pointerType === "mouse" && later(true, 80),
    onPointerLeave: (e: PointerEvent) => e.pointerType === "mouse" && later(false, 220),
    onFocus: () => later(true, 0),
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) later(false, 0);
    },
  };
  return { open: pinned || hovered, pinned, togglePin, handlers };
}

export const railShellClass =
  "rail-shell relative z-30 my-3 ml-3 hidden shrink-0 flex-col self-center overflow-x-hidden overflow-y-auto px-[10px] py-3 liquid-glass lg:flex max-h-[calc(100dvh-1.5rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Logo, name and the pin button. */
export function RailHeader({ href, homeLabel, title, open, pinned, onPin, pinLabel, unpinLabel }: { href: string; homeLabel: string; title: string; open: boolean; pinned: boolean; onPin: () => void; pinLabel: string; unpinLabel: string }) {
  return (
    <div className="mb-2 flex h-10 shrink-0 items-center gap-2.5 px-1">
      <Link href={href} aria-label={homeLabel} className="flex min-w-0 items-center gap-2.5">
        <LogoMark className="logo-in size-8" />
        <span className="rail-label text-[15px] font-bold tracking-[-0.02em]">{title}</span>
      </Link>
      <button
        type="button"
        onClick={onPin}
        aria-pressed={pinned}
        aria-label={pinned ? unpinLabel : pinLabel}
        title={pinned ? unpinLabel : pinLabel}
        tabIndex={open ? 0 : -1}
        className="rail-label ml-auto flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ring-foreground/15 hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {pinned ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
      </button>
    </div>
  );
}

/** Section title when open; a short divider when folded. */
export function RailSection({ title }: { title: string }) {
  return (
    <div aria-hidden className="relative flex h-6 shrink-0 items-center">
      <span className="rail-divider absolute left-[10px] h-px w-5 bg-foreground/15" />
      <span className="rail-label pl-2.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/80 uppercase">{title}</span>
    </div>
  );
}
