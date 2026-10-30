"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CornerDownLeft, Globe, Search, type LucideIcon } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useBusinesses } from "@/lib/admin/store";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  href: string;
  icon: LucideIcon;
}

/** Opens on Ctrl/⌘ K (or from the top-bar button): jump to any admin page or business. */
export function AdminCommandPalette({ open, onOpenChange, nav }: { open: boolean; onOpenChange: (open: boolean) => void; nav: { label: string; items: { href: string; label: string; icon: LucideIcon }[] }[] }) {
  const router = useRouter();
  const businesses = useBusinesses();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo<Item[]>(() => {
    const pages = nav.flatMap((g) => g.items.map((i) => ({ id: i.href, group: "Pages", label: i.label, hint: g.label, href: i.href, icon: i.icon })));
    const actions: Item[] = [{ id: "website", group: "Pages", label: "Website admin", hint: "Opens full screen", href: "/admin/website", icon: Globe }];
    const biz = businesses.map((b) => ({ id: b.id, group: "Businesses", label: b.name, hint: `${b.owner.name} · ${b.city}`, href: `/admin/businesses/${b.id}`, icon: Building2 }));
    return [...pages, ...actions, ...biz];
  }, [businesses, nav]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return all.filter((i) => i.group === "Pages").slice(0, 14);
    const hay = (i: Item) => {
      const b = businesses.find((x) => x.id === i.id);
      return `${i.label} ${i.hint ?? ""} ${b ? `${b.owner.email} ${b.whatsapp.number}` : ""}`.toLowerCase();
    };
    return all.filter((i) => hay(i).includes(q)).slice(0, 30);
  }, [all, q, businesses]);
  const current = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const go = (item?: Item) => {
    if (!item) return;
    onOpenChange(false);
    setQuery("");
    router.push(item.href);
  };

  let lastGroup = "";
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery("");
      }}
    >
      <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Search the admin panel</DialogTitle>
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
            placeholder="Jump to a page, business, owner, email or number…"
            aria-label="Search the admin panel"
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">Esc</kbd>
        </div>
        <ul ref={listRef} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</li>}
          {results.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <li key={`${item.group}-${item.id}`} role="presentation">
                {header && <p className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{header}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === current}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                  className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm", i === current ? "bg-muted text-foreground" : "text-foreground/90")}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                  {item.hint && <span className="truncate text-xs text-muted-foreground">{item.hint}</span>}
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
