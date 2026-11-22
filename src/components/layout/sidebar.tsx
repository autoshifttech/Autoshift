"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import {
  BarChart3,
  Bot,
  CalendarDays,
  FileText,
  Filter,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Repeat,
  Settings,
  ShoppingBag,
  Target,
  Users,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { isOn, pageForPath, usePages } from "@/lib/workspace/pages";

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  /**
   * When true, the nav row renders a small "Beta" chip after the label.
   * Purely informational — doesn't affect routing or access.
   */
  beta?: boolean;
}

// Grouped like the reference layout: day-to-day work, AI, outreach, account.
export const navGroups: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: "groupWorkspace",
    items: [
      { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
      { href: "/inbox", labelKey: "inbox", icon: MessageSquare },
      { href: "/leads", labelKey: "leads", icon: Target },
      { href: "/orders", labelKey: "orders", icon: ShoppingBag },
      { href: "/appointments", labelKey: "appointments", icon: CalendarDays },
      { href: "/insights", labelKey: "insights", icon: BarChart3 },
      { href: "/contacts", labelKey: "contacts", icon: Users },
    ],
  },
  {
    labelKey: "groupAi",
    items: [
      { href: "/agents", labelKey: "aiAgents", icon: Bot },
      { href: "/ai-tools", labelKey: "aiTools", icon: Wrench },
    ],
  },
  {
    labelKey: "groupEngagement",
    items: [
      { href: "/broadcasts", labelKey: "broadcasts", icon: Radio },
      { href: "/drips", labelKey: "drips", icon: Repeat },
      { href: "/segments", labelKey: "segments", icon: Filter },
      { href: "/automations", labelKey: "automations", icon: Zap },
      { href: "/flows", labelKey: "flows", icon: Workflow },
      { href: "/templates", labelKey: "templates", icon: FileText },
    ],
  },
  {
    labelKey: "groupAccount",
    items: [
      { href: "/settings", labelKey: "settings", icon: Settings },
    ],
  },
];

/** The phone bar keeps to four destinations plus "More", so each is easy to tap. */
const BAR_HREFS = ["/dashboard", "/inbox", "/broadcasts", "/contacts"];

/** The menu without the pages switched off for this business (the AutoShift team decides which). */
export function useVisibleNavGroups() {
  const pages = usePages();
  return navGroups.map((g) => ({ ...g, items: g.items.filter((i) => isOn(pages, pageForPath(i.href))) })).filter((g) => g.items.length > 0);
}

const allItems = navGroups.flatMap((g) => g.items);
const itemFor = (href: string) => allItems.find((i) => i.href === href)!;

function isActiveHref(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

export interface NavCounts {
  totalUnread: number;
}

/** Subscribes once; the shell passes the counts to both navs. */
export function useNavCounts(): NavCounts {
  return { totalUnread: useTotalUnread() };
}

function NavBadges({ href, active, counts, inline }: { href: string; active: boolean; counts: NavCounts; onRail?: boolean; inline?: boolean }) {
  const t = useTranslations("Sidebar");
  const { totalUnread } = counts;
  if (href === "/inbox" && totalUnread > 0 && !active) {
    return (
      <span key={totalUnread} aria-label={t("unreadConversations", { count: totalUnread })} className={cn("badge-pop flex h-5 min-w-5 items-center justify-center rounded-full bg-[#c2410c] px-1 text-xs font-bold text-white", inline ? "relative shrink-0" : "absolute -top-1 left-6 border-2 border-white/80")}>
        {totalUnread > 9 ? "9+" : totalUnread}
      </span>
    );
  }
  return null;
}

/** Every page not on the rail, grouped as in the old sidebar. */
function MorePages({ pathname, exclude, onPick, counts }: { pathname: string; exclude: string[]; onPick?: () => void; counts: NavCounts }) {
  const t = useTranslations("Sidebar");
  const groups = useVisibleNavGroups();
  return (
    <>
      {groups.map((group) => {
        const items = group.items.filter((i) => !exclude.includes(i.href));
        if (!items.length) return null;
        return (
          <div key={group.labelKey} className="pb-1">
            <p className="px-2.5 pt-2.5 pb-1 text-xs font-bold tracking-[0.1em] text-muted-foreground/80 uppercase">{t(group.labelKey)}</p>
            {items.map((item) => {
              const active = isActiveHref(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onPick}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    active ? "bg-card-2 font-semibold text-foreground" : "text-muted-foreground hover:bg-card-2 hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  <span className="flex-1">{t(item.labelKey)}</span>
                  <NavBadges href={item.href} active={active} counts={counts} inline />
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

const railActive = "rail-active opacity-100";

/** One row of the desktop rail: the icon never moves, the name slides out beside it. */
const railRow =
  "relative flex h-8 w-full shrink-0 items-center gap-2.5 rounded-full px-[11px] opacity-85 transition-[opacity,background-color] hover:bg-foreground/[0.06] hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:shrink-0 [&_svg]:[stroke-width:1.5]";

const PIN_KEY = "autoshift-rail-pinned";

/**
 * Desktop: a glass rail of icons. Hover it (or tab into it) and it smoothly
 * widens into a full menu with names, section titles, counts, the mode switch
 * and your profile; move away and it folds back. The pin keeps it open. The
 * page beside it narrows and re-flows instead of being covered. Phones get a
 * bottom bar instead (see MobileNav).
 */
export function Sidebar({ counts }: { counts: NavCounts }) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const groups = useVisibleNavGroups();
  const { profile } = useAuth();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timer = useRef(0);
  const open = pinned || hovered;

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(PIN_KEY) === "1") setPinned(true);
    } catch {}
    return () => window.clearTimeout(timer.current);
  }, []);

  // A short delay both ways, so brushing past the rail doesn't flap it open.
  const later = (next: boolean, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHovered(next), ms);
  };
  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    if (!next) setHovered(false);
    try {
      localStorage.setItem(PIN_KEY, next ? "1" : "0");
    } catch {}
  };
  const tip = (label: string) => (open ? undefined : label);
  const name = profile?.full_name || profile?.email || t("defaultUser");

  return (
    <aside
      aria-label={t("primaryNav")}
      data-open={open || undefined}
      onPointerEnter={(e) => e.pointerType === "mouse" && later(true, 90)}
      onPointerLeave={(e) => e.pointerType === "mouse" && later(false, 260)}
      onFocus={() => later(true, 0)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) later(false, 0);
      }}
      className="rail-shell relative z-30 my-3 ml-3 hidden shrink-0 flex-col self-center overflow-x-hidden overflow-y-auto px-[10px] py-3 liquid-glass lg:flex max-h-[calc(100dvh-1.5rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="mb-2 flex h-10 shrink-0 items-center gap-2.5 px-1">
        <Link href="/dashboard" aria-label={t("title")} className="flex min-w-0 items-center gap-2.5">
          <LogoMark className="logo-in size-8" />
          <span className="rail-label text-[15px] font-bold tracking-[-0.02em]">AutoShift</span>
        </Link>
        <button
          type="button"
          onClick={togglePin}
          aria-pressed={pinned}
          aria-label={pinned ? t("unpinMenu") : t("pinMenu")}
          title={pinned ? t("unpinMenu") : t("pinMenu")}
          tabIndex={open ? 0 : -1}
          className="rail-label ml-auto flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ring-foreground/15 hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {pinned ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </button>
      </div>
      <nav className="flex flex-col gap-0.5">
        {groups
          .map((group) => ({ ...group, items: group.items.filter((item) => item.href !== "/settings") }))
          .filter((group) => group.items.length > 0)
          .map((group, gi) => (
          <div key={group.labelKey} className="flex flex-col gap-0.5">
            {/* Section title when open; a short divider when folded. */}
            {gi > 0 && (
              <div aria-hidden className="relative flex h-6 shrink-0 items-center">
                <span className="rail-divider absolute left-[10px] h-px w-5 bg-foreground/15" />
                <span className="rail-label pl-2.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/80 uppercase">{t(group.labelKey)}</span>
              </div>
            )}
            {group.items.map((item, i) => {
                const active = isActiveHref(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={open ? undefined : t(item.labelKey)}
                    data-tip={tip(t(item.labelKey))}
                    aria-current={active ? "page" : undefined}
                    style={{ ["--i" as string]: i }}
                    className={cn(railRow, !open && "rail-tip", active && railActive)}
                  >
                    <item.icon className="size-[18px]" />
                    <span className="rail-label flex-1 truncate text-[13.5px] font-medium tracking-[-0.01em]">{t(item.labelKey)}</span>
                    <NavBadges href={item.href} active={active} counts={counts} onRail inline={open} />
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5 pt-2">
        <span aria-hidden className="mx-[10px] my-1.5 h-px shrink-0 bg-foreground/15" />
        <ModeToggle tip={!open} withLabel className={cn(railRow, !open && "rail-tip", "h-8 w-full justify-start")} />
        <Link
          href="/settings"
          aria-label={open ? undefined : t("settings")}
          data-tip={tip(t("settings"))}
          aria-current={isActiveHref(pathname, "/settings") ? "page" : undefined}
          className={cn(railRow, !open && "rail-tip", isActiveHref(pathname, "/settings") && railActive)}
        >
          <Settings className="size-[18px]" />
          <span className="rail-label flex-1 truncate text-[13.5px] font-medium tracking-[-0.01em]">{t("settings")}</span>
        </Link>
        {/* You: shows once the rail is open. */}
        <Link href="/settings" tabIndex={open ? 0 : -1} aria-hidden={!open} className="rail-profile mt-1.5 flex h-12 shrink-0 items-center gap-3 rounded-2xl border-t border-foreground/10 px-0.5 pt-1.5">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="size-8 object-cover" /> : name.charAt(0).toUpperCase()}
          </span>
          <span className="rail-label min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">{name}</span>
            {profile?.email && profile.email !== name && <span className="block truncate text-[11px] text-muted-foreground">{profile.email}</span>}
          </span>
        </Link>
      </div>
    </aside>
  );
}

/** Phone bottom bar: four main pages and a "More" sheet with the rest. */
export function MobileNav({ counts }: { counts: NavCounts }) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const pages = usePages();
  const bar = BAR_HREFS.filter((h) => isOn(pages, pageForPath(h)));
  const inMore = !bar.some((h) => isActiveHref(pathname, h));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  return (
    <nav data-mobile-nav aria-label={t("primaryNav")} className="fixed inset-x-3 bottom-3 z-40 flex h-16 items-center justify-around rounded-full px-3 liquid-glass lg-floating lg:hidden">
      {bar.map((href) => {
        const item = itemFor(href);
        const active = isActiveHref(pathname, href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("relative flex h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-semibold opacity-85 transition-colors", active && "rail-active opacity-100")}>
            <span className="relative">
              <item.icon className="size-5" />
              <NavBadges href={href} active={active} counts={counts} onRail />
            </span>
            <span className={cn(!active && "max-[400px]:sr-only")}>{t(item.labelKey)}</span>
          </Link>
        );
      })}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className={cn("flex h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-semibold opacity-85", inMore && "rail-active opacity-100")}>
          <MoreHorizontal className="size-5" />
          <span className={cn(!inMore && "max-[400px]:sr-only")}>{t("more")}</span>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[82vh] gap-0 overflow-y-auto rounded-t-3xl px-3 pt-4 pb-6">
          <SheetTitle className="px-2.5 pb-1 text-base">{t("morePages")}</SheetTitle>
          <MorePages pathname={pathname} exclude={bar} onPick={() => setOpen(false)} counts={counts} />
          <div className="mt-2 flex items-center gap-3 border-t border-border px-2.5 pt-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-sm font-bold text-primary">
              {profile?.full_name?.charAt(0)?.toUpperCase() ?? profile?.email?.charAt(0)?.toUpperCase() ?? "U"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{profile?.full_name ?? t("defaultUser")}</p>
              <p className="truncate text-xs text-muted-foreground">{profile?.email ?? ""}</p>
            </div>
            <ModeToggle className="rounded-xl border border-border" />
            <button type="button" onClick={signOut} aria-label={t("menuSignOut")} className="flex size-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground">
              <LogOut className="size-4" />
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
