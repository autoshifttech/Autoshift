"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import {
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  FileText,
  Filter,
  FolderOpen,
  GitBranch,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Radio,
  Repeat,
  Search,
  Settings,
  ShieldCheck,
  Target,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { openPalette } from "@/components/layout/command-palette";

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
// Flows (beta) is hidden from the menu while Automations and n8n cover
// automation; the /flows pages still work for anyone with a link.
export const navGroups: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: "groupWorkspace",
    items: [
      { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
      { href: "/inbox", labelKey: "inbox", icon: MessageSquare },
      { href: "/leads", labelKey: "leads", icon: Target },
      { href: "/insights", labelKey: "insights", icon: BarChart3 },
      { href: "/notifications", labelKey: "notifications", icon: Bell },
      { href: "/contacts", labelKey: "contacts", icon: Users },
      { href: "/bookings", labelKey: "bookings", icon: CalendarDays },
      { href: "/pipelines", labelKey: "pipelines", icon: GitBranch },
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
      { href: "/opt-ins", labelKey: "optIns", icon: ShieldCheck },
      { href: "/automations", labelKey: "automations", icon: Zap },
      { href: "/templates", labelKey: "templates", icon: FileText },
      { href: "/files", labelKey: "files", icon: FolderOpen },
    ],
  },
  {
    labelKey: "groupAccount",
    items: [
      { href: "/wallet", labelKey: "wallet", icon: Wallet },
      { href: "/support", labelKey: "support", icon: LifeBuoy },
      { href: "/settings", labelKey: "settings", icon: Settings },
    ],
  },
];

/** The phone bar keeps to four destinations plus "More", so each is easy to tap. */
const BAR_HREFS = ["/dashboard", "/inbox", "/broadcasts", "/bookings"];

/** The desktop rail shows these seven; the rest open from the dots. */
const RAIL_HREFS = ["/dashboard", "/inbox", "/broadcasts", "/bookings", "/contacts", "/automations", "/insights"];

const allItems = navGroups.flatMap((g) => g.items);
const itemFor = (href: string) => allItems.find((i) => i.href === href)!;

function isActiveHref(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

export interface NavCounts {
  totalUnread: number;
  unreadNotifications: number;
}

/** Subscribes once; the shell passes the counts to both navs. */
export function useNavCounts(): NavCounts {
  return { totalUnread: useTotalUnread(), unreadNotifications: useUnreadNotifications() };
}

function NavBadges({ href, active, counts, onRail }: { href: string; active: boolean; counts: NavCounts; onRail?: boolean }) {
  const t = useTranslations("Sidebar");
  const { totalUnread, unreadNotifications } = counts;
  if (href === "/inbox" && totalUnread > 0 && !active) {
    return (
      <span aria-label={t("unreadConversations", { count: totalUnread })} className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[var(--rail)] bg-[#e2673c] px-1 text-[9px] font-bold text-white">
        {totalUnread > 9 ? "9+" : totalUnread}
      </span>
    );
  }
  if (href === "/notifications" && unreadNotifications > 0) {
    return (
      <span aria-label={t("unreadNotifications", { count: unreadNotifications })} className={onRail ? "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[var(--rail)] bg-[#e2673c] px-1 text-[9px] font-bold text-white" : "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"}>
        {unreadNotifications > 9 ? "9+" : unreadNotifications}
      </span>
    );
  }
  return null;
}

/** Every page not on the rail, grouped as in the old sidebar. */
function MorePages({ pathname, exclude, onPick, counts }: { pathname: string; exclude: string[]; onPick?: () => void; counts: NavCounts }) {
  const t = useTranslations("Sidebar");
  return (
    <>
      {navGroups.map((group) => {
        const items = group.items.filter((i) => !exclude.includes(i.href));
        if (!items.length) return null;
        return (
          <div key={group.labelKey} className="pb-1">
            <p className="px-2.5 pt-2.5 pb-1 text-[10px] font-bold tracking-[0.1em] text-muted-foreground/80 uppercase">{t(group.labelKey)}</p>
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
                  <NavBadges href={item.href} active={active} counts={counts} />
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

const railButton =
  "rail-tip relative flex size-9 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none [&_svg]:[stroke-width:1.5]";
const railActive = "bg-[#fffdf9] text-[#1a1d1b] shadow-[0_6px_18px_-8px_rgb(0_0_0/0.6)] hover:bg-[#fffdf9] hover:text-[#1a1d1b]";

/**
 * Desktop: a dark rail of icon buttons with tooltips, the rest of the
 * pages under "More". Phones get a bottom bar instead (see MobileNav).
 */
export function Sidebar({ counts }: { counts: NavCounts }) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const current = [...allItems].sort((x, y) => y.href.length - x.href.length).find((i) => isActiveHref(pathname, i.href));
  const inMore = !!current && !RAIL_HREFS.includes(current.href) && current.href !== "/settings";
  const moreBadge = counts.unreadNotifications > 0;

  return (
    <aside
      aria-label={t("primaryNav")}
      className="relative z-30 my-3 ml-3 hidden w-[60px] shrink-0 flex-col items-center gap-0.5 self-center rounded-full bg-[var(--rail)] py-3 ring-1 ring-white/[0.06] shadow-[0_28px_60px_-24px_rgb(20_14_8/0.75)] lg:flex"
    >
      <Link href="/dashboard" aria-label={t("title")} className="mb-2 shrink-0">
        <LogoMark className="logo-in size-8" />
      </Link>
      <button type="button" onClick={openPalette} aria-label={t("search")} data-tip={t("search")} className={cn(railButton, "mb-1")}>
        <Search className="size-[18px]" />
      </button>
      <nav className="flex flex-col items-center gap-0.5">
        {RAIL_HREFS.map((href) => {
          const item = itemFor(href);
          const active = isActiveHref(pathname, href);
          return (
            <Link key={href} href={href} aria-label={t(item.labelKey)} data-tip={t(item.labelKey)} aria-current={active ? "page" : undefined} className={cn(railButton, active && railActive)}>
              <item.icon className="size-[18px]" />
              <NavBadges href={href} active={active} counts={counts} onRail />
            </Link>
          );
        })}
        {/* Everything else opens from the dots. */}
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger aria-label={t("more")} data-tip={t("more")} className={cn(railButton, inMore && railActive)}>
            <MoreHorizontal className="size-[18px]" />
            {moreBadge && <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full border-2 border-[var(--rail)] bg-[#c2410c]" />}
          </PopoverTrigger>
          <PopoverContent side="right" align="center" sideOffset={14} className="max-h-[80vh] w-64 gap-0 overflow-y-auto rounded-2xl p-1.5">
            <MorePages pathname={pathname} exclude={[...RAIL_HREFS, "/settings"]} onPick={() => setMoreOpen(false)} counts={counts} />
          </PopoverContent>
        </Popover>
      </nav>
      <span className="my-1.5 h-px w-6 shrink-0 bg-white/15" />
      <ModeToggle tip className={cn(railButton, "size-9 rounded-full")} />
      <Link href="/settings" aria-label={t("settings")} data-tip={t("settings")} aria-current={isActiveHref(pathname, "/settings") ? "page" : undefined} className={cn(railButton, isActiveHref(pathname, "/settings") && railActive)}>
        <Settings className="size-[18px]" />
      </Link>
    </aside>
  );
}

/** Phone bottom bar: four main pages and a "More" sheet with the rest. */
export function MobileNav({ counts }: { counts: NavCounts }) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const inMore = !BAR_HREFS.some((h) => isActiveHref(pathname, h));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  return (
    <nav aria-label={t("primaryNav")} className="fixed inset-x-3 bottom-3 z-40 flex h-16 items-center justify-around rounded-full bg-[var(--rail)] px-3 shadow-[0_20px_40px_-18px_rgb(20_14_8/0.7)] lg:hidden">
      {BAR_HREFS.map((href) => {
        const item = itemFor(href);
        const active = isActiveHref(pathname, href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("relative flex h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[10px] font-semibold text-white/60 transition-colors", active && "bg-[#fffdf9] text-[#1a1d1b]")}>
            <span className="relative">
              <item.icon className="size-5" />
              <NavBadges href={href} active={active} counts={counts} onRail />
            </span>
            {t(item.labelKey)}
          </Link>
        );
      })}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className={cn("flex h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[10px] font-semibold text-white/60", inMore && "bg-[#fffdf9] text-[#1a1d1b]")}>
          <MoreHorizontal className="size-5" />
          {t("more")}
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[82vh] gap-0 overflow-y-auto rounded-t-3xl px-3 pt-4 pb-6">
          <SheetTitle className="px-2.5 pb-1 text-base">{t("morePages")}</SheetTitle>
          <MorePages pathname={pathname} exclude={BAR_HREFS} onPick={() => setOpen(false)} counts={counts} />
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
