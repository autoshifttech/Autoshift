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
  Megaphone,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  Tags,
  UsersRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo-mark";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setAdminCookie } from "@/lib/admin/session";
import { buildAlerts } from "@/lib/admin/alerts";
import { ROLE_LABEL } from "@/lib/admin/data";
import { CURRENT_ADMIN, useAdmin, useBusinesses } from "@/lib/admin/store";
import { relTime } from "@/lib/admin/format";
import { Initials, Pill, SEVERITY_META } from "./admin-ui";

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

function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { tickets } = useAdmin();
  const openTickets = tickets.filter((t) => t.status === "open").length;
  const current = activeItem(pathname);
  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={cn("fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      <aside
        aria-label="Admin navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card transition-transform duration-200 lg:static lg:z-0 lg:w-60 lg:translate-x-0 lg:transition-none",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <Link href="/admin" className="flex items-center gap-2" onClick={onClose}>
            <LogoMark className="size-8" />
            <span className="text-base font-extrabold tracking-tight text-foreground">AutoShift</span>
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase">Admin</span>
          </Link>
          <button type="button" onClick={onClose} aria-label="Close menu" className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden">
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {ADMIN_NAV.map((group, gi) => (
            <div key={group.label} className={gi ? "mt-5" : undefined}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.09em] text-muted-foreground/80 uppercase">{group.label}</p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = current?.href === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:py-2", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                      >
                        <item.icon className="size-4" />
                        <span className="flex-1">{item.label}</span>
                        {item.href === "/admin/support" && openTickets > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{openTickets}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="shrink-0 space-y-1 border-t border-border p-3">
          {/* The public website has its own editor; it gets a button of its own. */}
          <Link
            href="/admin/website"
            onClick={onClose}
            className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            <Globe className="size-4" />
            <span className="flex-1">
              Website admin
              <span className="block text-[11px] font-normal text-muted-foreground">Opens full screen</span>
            </span>
          </Link>
          <Link href="/dashboard" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            <BarChart3 className="size-3.5" />
            Open the business app
          </Link>
        </div>
      </aside>
    </>
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
        className="h-9 w-full rounded-full border border-border bg-card pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
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
      <PopoverTrigger aria-label={`Alerts (${alerts.length})`} className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
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
        <ul className="max-h-96 divide-y divide-border overflow-y-auto">
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
      <PopoverTrigger className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-muted" aria-label="Admin account">
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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const title = activeItem(pathname)?.label ?? "Admin";
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AdminSidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden">
            <Menu className="size-5" />
          </button>
          <p className="min-w-0 truncate text-base font-semibold text-foreground lg:w-48 lg:shrink-0">{title}</p>
          <div className="flex flex-1 justify-center">
            <BusinessSearch />
          </div>
          <div className="flex items-center gap-1">
            <AlertsBell />
            <ModeToggle />
            <AdminMenu />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-[1400px] space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
