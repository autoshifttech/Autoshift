"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Building2,
  CreditCard,
  FileClock,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  Megaphone,
  MoreHorizontal,
  Search,
  Settings2,
  ShieldCheck,
  Tags,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo-mark";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { setAdminCookie } from "@/lib/admin/session";
import { buildAlerts } from "@/lib/admin/alerts";
import { ROLE_LABEL } from "@/lib/admin/data";
import { CURRENT_ADMIN, useAdmin, useBusinesses } from "@/lib/admin/store";
import { relTime } from "@/lib/admin/format";
import { Initials, Pill, SEVERITY_META } from "./admin-ui";
import { RailTip } from "@/components/layout/rail-tip";
import { PageMotion } from "@/components/motion/page-motion";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const ADMIN_NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Platform",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/businesses", label: "Businesses", icon: Building2 },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
      { href: "/admin/wallet", label: "Wallet & costs", icon: Wallet },
      { href: "/admin/plans", label: "Plans & pricing", icon: Tags },
    ],
  },
  {
    label: "Health",
    items: [
      { href: "/admin/whatsapp", label: "WhatsApp health", icon: ShieldCheck },
      { href: "/admin/ai", label: "AI usage", icon: Bot },
      { href: "/admin/system", label: "System status", icon: Activity },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/admin/support", label: "Support inbox", icon: LifeBuoy },
      { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
      { href: "/admin/emails", label: "Owner emails", icon: Mail },
      { href: "/admin/team", label: "Admin team", icon: UsersRound },
      { href: "/admin/audit", label: "Audit log", icon: FileClock },
      { href: "/admin/settings", label: "Alert settings", icon: Settings2 },
    ],
  },
];

const ALL_ITEMS = ADMIN_NAV.flatMap((g) => g.items);

function activeItem(pathname: string) {
  return [...ALL_ITEMS].sort((a, b) => b.href.length - a.href.length).find((i) => pathname === i.href || (i.href !== "/admin" && pathname.startsWith(i.href)));
}

/** Shown in the phone bar; the rest sit under "More". */
const BAR_HREFS = ["/admin", "/admin/businesses", "/admin/payments", "/admin/support"];

const railButton =
  "rail-tip relative flex size-10 shrink-0 items-center justify-center rounded-xl text-white/55 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none";
const railActive = "bg-[#fffdf9] text-[#1a1d1b] shadow-[0_6px_18px_-8px_rgb(0_0_0/0.6)] hover:bg-[#fffdf9] hover:text-[#1a1d1b]";

function itemFor(href: string) {
  return ALL_ITEMS.find((i) => i.href === href)!;
}

function SupportBadge({ href, count }: { href: string; count: number }) {
  if (href !== "/admin/support" || count === 0) return null;
  return <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[var(--rail)] bg-[#e2673c] px-1 text-[9px] font-bold text-white">{count}</span>;
}

/** The pages that aren't on the rail, plus the website editor and the business app. */
function MoreList({ exclude, currentHref, onPick }: { exclude: string[]; currentHref?: string; onPick?: () => void }) {
  return (
    <>
      {ADMIN_NAV.map((group) => {
        const items = group.items.filter((i) => !exclude.includes(i.href));
        if (!items.length) return null;
        return (
          <div key={group.label} className="pb-1">
            <p className="px-2.5 pt-2.5 pb-1 text-[10px] font-bold tracking-[0.1em] text-muted-foreground/80 uppercase">{group.label}</p>
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onPick}
                aria-current={currentHref === item.href ? "page" : undefined}
                className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors", currentHref === item.href ? "bg-card-2 font-semibold text-foreground" : "text-muted-foreground hover:bg-card-2 hover:text-foreground")}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </div>
        );
      })}
      <div className="mt-1 space-y-1 border-t border-border pt-2">
        {/* The public website has its own editor; it opens full screen. */}
        <Link href="/admin/website" onClick={onPick} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-primary hover:bg-primary-soft">
          <Globe className="size-4" />
          <span className="flex-1">
            Website admin
            <span className="block text-[11px] font-normal text-muted-foreground">Opens full screen</span>
          </span>
        </Link>
        <Link href="/dashboard" onClick={onPick} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-muted-foreground hover:bg-card-2 hover:text-foreground">
          <BarChart3 className="size-3.5" />
          Open the business app
        </Link>
      </div>
    </>
  );
}

/** Desktop: every admin page as an icon, grouped, with hover names. */
function AdminRail() {
  const pathname = usePathname();
  const { tickets } = useAdmin();
  const openTickets = tickets.filter((t) => t.status === "open").length;
  const current = activeItem(pathname);
  return (
    <aside aria-label="Admin navigation" className="relative z-30 m-3 mr-0 hidden w-[58px] shrink-0 flex-col items-center gap-1 rounded-[20px] bg-[var(--rail)] py-3.5 ring-1 ring-white/[0.06] shadow-[0_24px_50px_-26px_rgb(20_14_8/0.7)] lg:flex">
      <Link href="/admin" aria-label="AutoShift admin" className="mb-3 shrink-0">
        <LogoMark className="logo-in size-9" />
      </Link>
      <nav className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto [scrollbar-width:none]">
        {ADMIN_NAV.map((group, gi) => (
          <div key={group.label} role="group" aria-label={group.label} className="flex flex-col items-center gap-1">
            {gi > 0 && <span aria-hidden className="my-1 h-px w-6 bg-white/10" />}
            {group.items.map((item) => {
              const active = current?.href === item.href;
              return (
                <Link key={item.href} href={item.href} aria-label={item.label} data-tip={item.label} aria-current={active ? "page" : undefined} className={cn(railButton, active && railActive)}>
                  <item.icon className="size-[18px]" />
                  <SupportBadge href={item.href} count={openTickets} />
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <span className="my-1.5 h-px w-6 shrink-0 bg-white/10" />
      <Link href="/admin/website" aria-label="Website admin (opens full screen)" data-tip="Website admin" className={railButton}>
        <Globe className="size-[18px]" />
      </Link>
      <Link href="/dashboard" aria-label="Open the business app" data-tip="Open the business app" className={railButton}>
        <BarChart3 className="size-[18px]" />
      </Link>
      <ModeToggle tip className={cn(railButton, "size-10 rounded-xl")} />
    </aside>
  );
}

/** Phones: four pages and a "More" sheet. */
function AdminMobileNav() {
  const pathname = usePathname();
  const { tickets } = useAdmin();
  const openTickets = tickets.filter((t) => t.status === "open").length;
  const current = activeItem(pathname);
  const [open, setOpen] = useState(false);
  const inMore = !current || !BAR_HREFS.includes(current.href);
  return (
    <nav aria-label="Admin navigation" className="fixed inset-x-3 bottom-3 z-40 flex h-16 items-center justify-around rounded-[20px] bg-[var(--rail)] px-2 shadow-[0_20px_40px_-18px_rgb(20_14_8/0.7)] lg:hidden">
      {BAR_HREFS.map((href) => {
        const item = itemFor(href);
        const active = current?.href === href;
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("relative flex h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[10px] font-semibold text-white/60", active && "bg-[#fffdf9] text-[#1a1d1b]")}>
            <span className="relative">
              <item.icon className="size-5" />
              <SupportBadge href={href} count={openTickets} />
            </span>
            {item.label === "Support inbox" ? "Support" : item.label}
          </Link>
        );
      })}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className={cn("flex h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[10px] font-semibold text-white/60", inMore && "bg-[#fffdf9] text-[#1a1d1b]")}>
          <MoreHorizontal className="size-5" />
          More
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[82vh] gap-0 overflow-y-auto rounded-t-3xl px-3 pt-4 pb-6">
          <div className="flex items-center justify-between px-2.5 pb-1">
            <SheetTitle className="text-base">All pages</SheetTitle>
            <ModeToggle className="rounded-xl border border-border" />
          </div>
          <MoreList exclude={BAR_HREFS} currentHref={current?.href} onPick={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </nav>
  );
}

function BusinessSearch() {
  const router = useRouter();
  const businesses = useBusinesses();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return businesses.filter((b) => `${b.name} ${b.owner.name} ${b.owner.email} ${b.whatsapp.number} ${b.city}`.toLowerCase().includes(s)).slice(0, 6);
  }, [q, businesses]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const go = (id: string) => {
    setOpen(false);
    setQ("");
    router.push(`/admin/businesses/${id}`);
  };

  return (
    <div ref={box} className="relative hidden w-full max-w-sm md:block">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) go(results[0].id);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Find a business, owner, email or number…"
        aria-label="Find a business"
        className="h-10 w-full rounded-xl border border-border bg-card pr-3 pl-9 text-sm text-foreground shadow-[var(--shadow-card)] outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
      />
      {open && q.trim() && (
        <div className="absolute top-11 right-0 left-0 z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No business matches “{q}”.</p>
          ) : (
            results.map((b) => (
              <button key={b.id} type="button" onClick={() => go(b.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted">
                <Initials name={b.name} className="size-7 text-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{b.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {b.owner.name} · {b.city}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AlertsBell() {
  const businesses = useBusinesses();
  const state = useAdmin();
  const alerts = buildAlerts(businesses, state);
  const critical = alerts.filter((a) => a.severity !== "info").length;
  return (
    <Popover>
      <PopoverTrigger aria-label={`Alerts (${alerts.length})`} className="relative flex size-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-[var(--shadow-card)] hover:text-foreground">
        <Bell className="size-[18px]" />
        {critical > 0 && <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">{critical}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Alerts</p>
          <Link href="/admin" className="text-xs font-medium text-primary hover:underline">
            See all
          </Link>
        </div>
        <ul className="stack-in max-h-96 divide-y divide-border overflow-y-auto">
          {alerts.slice(0, 8).map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="flex gap-3 px-4 py-3 hover:bg-muted">
                <Pill tone={SEVERITY_META[a.severity].tone}>{SEVERITY_META[a.severity].label}</Pill>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground">{a.title}</span>
                  <span className="block text-xs text-muted-foreground">{relTime(a.at)}</span>
                </span>
              </Link>
            </li>
          ))}
          {alerts.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">All clear.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function AdminMenu() {
  const router = useRouter();
  return (
    <Popover>
      <PopoverTrigger className="flex items-center gap-2 rounded-xl border border-border bg-card py-1 pr-3 pl-1 shadow-[var(--shadow-card)] hover:bg-card-2" aria-label="Admin account">
        <Initials name="Founder Admin" className="size-8" />
        <span className="hidden text-left sm:block">
          <span className="block text-sm leading-tight font-medium text-foreground">{CURRENT_ADMIN.name}</span>
          <span className="block text-[11px] leading-tight text-muted-foreground">{ROLE_LABEL[CURRENT_ADMIN.role]}</span>
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-56 gap-1 p-1.5">
        <Link href="/admin/team" className="rounded-md px-2.5 py-2 text-sm text-foreground hover:bg-muted">
          Admin team & roles
        </Link>
        <Link href="/admin/audit" className="rounded-md px-2.5 py-2 text-sm text-foreground hover:bg-muted">
          My activity
        </Link>
        <button
          type="button"
          onClick={() => {
            setAdminCookie(false);
            router.push("/admin/login");
          }}
          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-rose-600 hover:bg-muted"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-canvas admin-canvas flex h-dvh overflow-hidden bg-background">
      <AdminRail />
      <RailTip />
      {/* The top bar scrolls with the page, so there's no band behind it. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="flex h-16 shrink-0 items-center gap-3 px-4 pt-2 sm:px-6 lg:h-[4.5rem] lg:pt-3">
          <Link href="/admin" className="flex items-center gap-2 lg:hidden">
            <LogoMark className="size-8" />
            <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase">Admin</span>
          </Link>
          <div className="flex flex-1 justify-end lg:justify-start">
            <BusinessSearch />
          </div>
          <div className="flex items-center gap-2">
            <AlertsBell />
            <AdminMenu />
          </div>
        </header>
        <main className="flex-1 px-4 pt-2 pb-24 sm:px-6 lg:pb-8">
          <PageMotion className="mx-auto max-w-[1400px] space-y-6">{children}</PageMotion>
        </main>
      </div>
      <AdminMobileNav />
    </div>
  );
}
