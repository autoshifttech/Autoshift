"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import {
  BarChart3,
  Bot,
  FileText,
  Filter,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Radio,
  Repeat,
  Settings,
  Target,
  Users,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ModeToggle } from "@/components/layout/mode-toggle";

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

function NavBadges({ href, active, counts }: { href: string; active: boolean; counts: NavCounts; onRail?: boolean }) {
  const t = useTranslations("Sidebar");
  const { totalUnread } = counts;
  if (href === "/inbox" && totalUnread > 0 && !active) {
    return (
      <span aria-label={t("unreadConversations", { count: totalUnread })} className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white/80 bg-[#c2410c] px-1 text-xs font-bold text-white">
        {totalUnread > 9 ? "9+" : totalUnread}
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
  "rail-tip relative flex size-9 shrink-0 items-center justify-center rounded-full opacity-85 transition-[opacity,background-color] hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:[stroke-width:1.5]";
const railActive = "rail-active opacity-100";

/**
 * Desktop: a glass rail with an icon for every page and a tooltip name on
 * hover; opt-ins, files and the wallet live in Settings. Phones get a bottom
 * bar instead (see MobileNav).
 */
export function Sidebar({ counts }: { counts: NavCounts }) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();

  return (
    <aside
      aria-label={t("primaryNav")}
      className="relative z-30 my-3 ml-3 hidden w-[60px] shrink-0 flex-col items-center gap-0.5 self-center rounded-full py-3 liquid-glass lg:flex max-h-[calc(100dvh-1.5rem)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Link href="/dashboard" aria-label={t("title")} className="mb-2 shrink-0">
        <LogoMark className="logo-in size-8" />
      </Link>
      <nav className="flex flex-col items-center gap-0.5">
        {navGroups.map((group, gi) => (
          <div key={group.labelKey} className="flex flex-col items-center gap-0.5">
            {gi > 0 && <span aria-hidden className="my-1 h-px w-5 shrink-0 bg-foreground/15" />}
            {group.items
              .filter((item) => item.href !== "/settings")
              .map((item) => {
                const active = isActiveHref(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} aria-label={t(item.labelKey)} data-tip={t(item.labelKey)} aria-current={active ? "page" : undefined} className={cn(railButton, active && railActive)}>
                    <item.icon className="size-[18px]" />
                    <NavBadges href={item.href} active={active} counts={counts} onRail />
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>
      <span className="my-1.5 h-px w-6 shrink-0 bg-foreground/15" />
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
    <nav aria-label={t("primaryNav")} className="fixed inset-x-3 bottom-3 z-40 flex h-16 items-center justify-around rounded-full px-3 liquid-glass lg-floating lg:hidden">
      {BAR_HREFS.map((href) => {
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
