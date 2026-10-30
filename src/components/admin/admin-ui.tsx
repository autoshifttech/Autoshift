"use client";

import { useAdminT } from "@/lib/admin/strings";
import { EmptyPanel } from "@/components/ui/empty-panel";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { RollingNumber } from "@/components/motion/rolling-number";
import { cn } from "@/lib/utils";
import type { BusinessStatus, NumberStatus, Quality, TicketPriority, TicketStatus } from "@/lib/admin/data";
import type { Severity } from "@/lib/admin/alerts";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  const tr = useAdminT();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="title-weight text-[27px] leading-tight font-bold tracking-[-0.03em] text-foreground">{tr(title)}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{tr(description)}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, description, actions, children, className, bodyClassName }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  const tr = useAdminT();
  return (
    <section className={cn("min-w-0 rounded-[20px] border border-border bg-card shadow-[var(--shadow-card)]", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-foreground">{tr(title)}</h2>}
            {description && <p className="text-sm text-muted-foreground">{tr(description)}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn("p-5", (title || actions) && "pt-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, delta, icon: Icon, tone = "mint", href }: { label: string; value: string; hint?: string; delta?: number; icon?: LucideIcon; tone?: "mint" | "peach" | "sky" | "lilac" | "butter"; href?: string }) {
  const tr = useAdminT();
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        {Icon && (
          <span className="flex size-8 items-center justify-center rounded-lg text-foreground" style={{ background: `var(--tone-${tone})` }}>
            <Icon className="size-4" />
          </span>
        )}
        {delta !== undefined && <Delta value={delta} />}
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular-nums"><RollingNumber>{value}</RollingNumber></p>
      <p className="text-sm text-muted-foreground">{tr(label)}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground/80">{hint}</p>}
    </>
  );
  const cls = "block min-w-0 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-primary/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold", good ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/10 text-rose-700 dark:text-rose-400")}>
      <Icon className="size-3" />
      {Math.abs(Math.round(value * 100))}%
    </span>
  );
}

const PILL: Record<string, string> = {
  green: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-800 ring-amber-600/20 dark:text-amber-300",
  red: "bg-rose-500/10 text-rose-700 ring-rose-600/20 dark:text-rose-400",
  blue: "bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:text-sky-300",
  gray: "bg-muted text-muted-foreground ring-border",
  violet: "bg-violet-500/10 text-violet-700 ring-violet-600/20 dark:text-violet-300",
};

export function Pill({ tone, children, dot = true }: { tone: keyof typeof PILL; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", PILL[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const STATUS_META: Record<BusinessStatus, { label: string; tone: keyof typeof PILL }> = {
  trial: { label: "Trial", tone: "blue" },
  expired: { label: "Trial ended", tone: "gray" },
  active: { label: "Active", tone: "green" },
  past_due: { label: "Past due", tone: "amber" },
  cancelled: { label: "Cancelled", tone: "gray" },
  blocked: { label: "Blocked", tone: "red" },
};

export function StatusPill({ status }: { status: BusinessStatus }) {
  return <Pill tone={STATUS_META[status].tone}>{STATUS_META[status].label}</Pill>;
}

export const NUMBER_META: Record<NumberStatus, { label: string; tone: keyof typeof PILL }> = {
  connected: { label: "Connected", tone: "green" },
  not_connected: { label: "Not connected", tone: "gray" },
  disconnected: { label: "Disconnected", tone: "red" },
};

export const QUALITY_META: Record<Quality, { label: string; tone: keyof typeof PILL }> = {
  green: { label: "High", tone: "green" },
  yellow: { label: "Medium", tone: "amber" },
  red: { label: "Low", tone: "red" },
};

export function QualityPill({ quality }: { quality: Quality }) {
  return <Pill tone={QUALITY_META[quality].tone}>{QUALITY_META[quality].label}</Pill>;
}

export const TICKET_STATUS_META: Record<TicketStatus, { label: string; tone: keyof typeof PILL }> = {
  open: { label: "Open", tone: "blue" },
  pending: { label: "Waiting on business", tone: "amber" },
  closed: { label: "Closed", tone: "gray" },
};

export const PRIORITY_META: Record<TicketPriority, { label: string; tone: keyof typeof PILL }> = {
  low: { label: "Low", tone: "gray" },
  normal: { label: "Normal", tone: "blue" },
  high: { label: "High", tone: "amber" },
  urgent: { label: "Urgent", tone: "red" },
};

export const SEVERITY_META: Record<Severity, { label: string; tone: keyof typeof PILL }> = {
  critical: { label: "Critical", tone: "red" },
  warning: { label: "Warning", tone: "amber" },
  info: { label: "Info", tone: "blue" },
};

/** Two-letter initials in a coloured circle, stable per name. */
export function Initials({ name, className }: { name: string; className?: string }) {
  const colors = ["#1E4C41", "#B45309", "#2563EB", "#BE185D", "#7C5CBF", "#0F766E", "#C2410C", "#475569"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const initials = name
    .replace(/[^A-Za-z ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white", className)} style={{ background: colors[h % colors.length] }}>
      {initials || "?"}
    </span>
  );
}

/** Simple responsive table shell: scrolls sideways on small screens. */
export function DataTable({ head, children, empty, className }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode; className?: string }) {
  const tr = useAdminT();
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold tracking-wide text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className="relative px-3 py-2 font-semibold whitespace-nowrap first:pl-5 last:pr-5">
                {typeof h === "string" ? tr(h) : h || <span className="sr-only">{tr("Actions")}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border [&>tr]:transition-colors [&>tr:hover]:bg-muted/40">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export const td = "px-3 py-2.5 align-middle first:pl-5 last:pr-5";

/** Segmented control used for filters and ranges. */
export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-full bg-muted p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors", value === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Horizontal meter, e.g. share of revenue. */
export function Meter({ value, max, className, tone = "bg-primary" }: { value: number; max: number; className?: string; tone?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${max ? Math.min(100, Math.max(1, (value / max) * 100)) : 0}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, detail }: { icon: LucideIcon; title: string; detail?: string }) {
  return <EmptyPanel icon={icon} title={title} description={detail} className="py-12" />;
}
