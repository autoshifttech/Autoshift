"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, Code2, Inbox, LifeBuoy, MessageCircle, PlugZap, Sparkles, Wallet, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { openPalette } from "./command-palette";

/** Floating help: guides, what's new, contact support and shortcuts. */
export function HelpButton() {
  const t = useTranslations("Help");
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // On phones the inbox composer sits where the button would float.
  const hideOnPhone = usePathname().startsWith("/inbox");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const guides = [
    { href: "/settings?tab=whatsapp", icon: PlugZap, label: t("guideWhatsapp") },
    { href: "/agents", icon: Sparkles, label: t("guideAssistant") },
    { href: "/wallet", icon: Wallet, label: t("guideWallet") },
    { href: "/automations/n8n", icon: Code2, label: t("guideApi") },
  ];

  return (
    <div ref={panel} className={cn("no-print fixed right-4 bottom-24 z-40 flex-col items-end gap-3 sm:right-6 lg:bottom-6 lg:flex", hideOnPhone ? "hidden" : "flex")}>
      {open && (
        <div role="dialog" aria-label={t("title")} className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-popover shadow-[0_16px_40px_-12px_rgb(0_0_0/0.25)]">
          <div className="bg-[#1E4C41] px-5 py-4 text-white">
            <p className="text-base font-semibold">{t("title")}</p>
            <p className="text-sm text-white/80">{t("subtitle")}</p>
          </div>
          <div className="space-y-4 p-4">
            <ul className="space-y-1">
              {guides.map(({ href, icon: Icon, label }) => (
                <li key={href}>
                  <Link href={href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-muted">
                    <Icon className="size-4 text-primary" />
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <a href="/release-notes" className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-muted">
                  <BookOpen className="size-4 text-primary" />
                  {t("whatsNew")}
                </a>
              </li>
            </ul>
            <Link
              href="/support?new=1"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl bg-[var(--tone-mint)] px-3 py-3 text-sm font-medium text-foreground hover:brightness-95"
            >
              <MessageCircle className="size-5 text-primary" />
              <span>
                {t("contact")}
                <span className="block text-xs font-normal text-muted-foreground">{t("contactHint")}</span>
              </span>
            </Link>
            <Link href="/support" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-2 py-1 text-sm text-foreground hover:bg-muted">
              <Inbox className="size-4 text-primary" />
              {t("myRequests")}
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openPalette();
              }}
              className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {t("shortcut")}
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">Ctrl K</kbd>
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? t("close") : t("open")}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_-6px_rgb(30_76_65/0.6)] transition-transform hover:scale-105",
          open && "rotate-90",
        )}
      >
        {open ? <X className="size-5" /> : <LifeBuoy className="size-5" />}
      </button>
    </div>
  );
}
