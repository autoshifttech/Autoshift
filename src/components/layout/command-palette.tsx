"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bot, CalendarPlus, CornerDownLeft, Filter, Plus, Repeat, Search, Target, Wallet, type LucideIcon } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createStore, useStore } from "@/lib/workspace/store";
import { useAssistants } from "@/lib/assistants/model";
import { useDrips } from "@/lib/drips/model";
import { useLeads } from "@/lib/leads/model";
import { useSegments } from "@/lib/segments/model";
import { navGroups } from "./sidebar";

/** Open state shared by the header search button and the Ctrl+K shortcut. */
export const paletteStore = createStore(() => ({ open: false }));
export const openPalette = () => paletteStore.set({ open: true });

type Item = { id: string; group: string; label: string; hint?: string; href: string; icon: LucideIcon };

/** Ctrl/⌘+K: jump to any page, lead, assistant, drip or segment, or start a common action. */
export function CommandPalette() {
  const t = useTranslations("Search");
  const ts = useTranslations("Sidebar");
  const router = useRouter();
  const { open } = useStore(paletteStore, { open: false });
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const leads = useLeads();
  const { assistants } = useAssistants();
  const drips = useDrips();
  const segments = useSegments();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        paletteStore.set((s) => ({ open: !s.open }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const all: Item[] = [
    ...navGroups.flatMap((g) => g.items.map((i) => ({ id: `p${i.href}`, group: t("groupPages"), label: ts(i.labelKey), href: i.href, icon: i.icon }))),
    { id: "a-booking", group: t("groupActions"), label: t("actionBooking"), href: "/bookings", icon: CalendarPlus },
    { id: "a-topup", group: t("groupActions"), label: t("actionTopUp"), href: "/wallet", icon: Wallet },
    { id: "a-drip", group: t("groupActions"), label: t("actionDrip"), href: "/drips", icon: Plus },
    { id: "a-assistant", group: t("groupActions"), label: t("actionAssistant"), href: "/agents", icon: Plus },
    ...leads.map((l) => ({ id: `l${l.id}`, group: t("groupLeads"), label: l.name, hint: l.phone, href: "/leads", icon: Target })),
    ...assistants.map((a) => ({ id: `as${a.id}`, group: t("groupAssistants"), label: a.name, href: `/agents/${a.id}`, icon: Bot })),
    ...drips.map((d) => ({ id: `d${d.id}`, group: t("groupDrips"), label: d.name || "—", href: `/drips/${d.id}`, icon: Repeat })),
    ...segments.map((s) => ({ id: `s${s.id}`, group: t("groupSegments"), label: s.name, href: "/segments", icon: Filter })),
  ];
  const q = query.trim().toLowerCase();
  const results = (q ? all.filter((i) => `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(q)) : all.filter((i) => i.group === t("groupPages") || i.group === t("groupActions"))).slice(0, 40);
  const current = Math.min(active, Math.max(0, results.length - 1));

  const go = (item: Item | undefined) => {
    if (!item) return;
    paletteStore.set({ open: false });
    setQuery("");
    router.push(item.href);
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  let lastGroup = "";
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        paletteStore.set({ open: o });
        if (!o) setQuery("");
      }}
    >
      <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive(Math.min(current + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive(Math.max(current - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(results[current]);
              }
            }}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <ul ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">{t("noResults", { query })}</li>}
          {results.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <li key={item.id} role="presentation">
                {header && <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{header}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === current}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", i === current ? "bg-muted text-foreground" : "text-foreground/90")}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="truncate font-mono text-xs text-muted-foreground">{item.hint}</span>}
                  {i === current && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function SearchButton() {
  const t = useTranslations("Search");
  return (
    <button
      type="button"
      onClick={openPalette}
      className="hidden h-10 items-center gap-2 rounded-xl border border-border bg-card pr-2 pl-3 text-sm font-semibold text-foreground shadow-[var(--shadow-card)] transition-colors hover:bg-card-2 md:inline-flex"
    >
      <Search className="size-3.5" />
      <span className="w-24 text-left lg:w-36">{t("button")}</span>
      <kbd className="rounded-md border border-border px-1.5 py-0.5 font-sans text-[10px]">Ctrl K</kbd>
    </button>
  );
}
