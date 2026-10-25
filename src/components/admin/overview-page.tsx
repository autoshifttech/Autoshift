"use client";

import Link from "next/link";
import { BadgeIndianRupee, Building2, ChevronRight, Hourglass, PiggyBank, Repeat, TrendingDown, UserPlus, Wallet, X } from "lucide-react";

import { BarChart } from "@/components/tremor/bar-chart";
import { ADMIN_NOW, INDUSTRY_LABEL, MONTHS, usageRevenue, type Business } from "@/lib/admin/data";
import { buildAlerts } from "@/lib/admin/alerts";
import { date, inr, inrCompact, inrShort, num, pct, relTime } from "@/lib/admin/format";
import { adminStore, useAdmin, useBusinesses, usePayments } from "@/lib/admin/store";
import { Initials, Kpi, Meter, PageHeader, Panel, Pill, SEVERITY_META, StatusPill } from "./admin-ui";

const DAY = 864e5;

function windowSum(payments: ReturnType<typeof usePayments>, from: number, to: number) {
  let subs = 0;
  let topups = 0;
  let refunds = 0;
  for (const p of payments) {
    const t = new Date(p.at).getTime();
    if (t < ADMIN_NOW - from * DAY || t >= ADMIN_NOW - to * DAY) continue;
    if (p.kind === "refund") refunds += p.amount;
    else if (p.status === "captured" && p.kind === "subscription") subs += p.amount;
    else if (p.status === "captured") topups += p.amount;
  }
  return { subs, topups, refunds, total: subs + topups + refunds };
}

export function platformTotals(businesses: Business[]) {
  const paying = businesses.filter((b) => b.status === "active" || b.status === "past_due");
  const trials = businesses.filter((b) => b.status === "trial");
  const mrr = paying.reduce((s, b) => s + b.mrr, 0);
  const usage = businesses.reduce((acc, b) => {
    const u = usageRevenue(b.usage);
    return { charged: acc.charged + u.charged, cost: acc.cost + u.cost };
  }, { charged: 0, cost: 0 });
  // Trial to paid: of businesses whose trial is over, how many ever paid.
  const matured = businesses.filter((b) => b.status !== "trial");
  const converted = matured.filter((b) => b.status !== "expired");
  const cancelled = businesses.filter((b) => b.status === "cancelled").length;
  return {
    paying,
    trials,
    mrr,
    usage,
    conversion: matured.length ? converted.length / matured.length : 0,
    churn: paying.length + cancelled ? cancelled / (paying.length + cancelled) / 6 : 0,
  };
}

export function AdminOverview() {
  const businesses = useBusinesses();
  const payments = usePayments();
  const state = useAdmin();
  const alerts = buildAlerts(businesses, state);
  const totals = platformTotals(businesses);
  const now30 = windowSum(payments, 30, 0);
  const prev30 = windowSum(payments, 60, 30);
  const profit = now30.total - totals.usage.cost;
  const signups30 = businesses.filter((b) => ADMIN_NOW - new Date(b.createdAt).getTime() <= 30 * DAY).length;
  const signupsPrev = businesses.filter((b) => {
    const age = ADMIN_NOW - new Date(b.createdAt).getTime();
    return age > 30 * DAY && age <= 60 * DAY;
  }).length;
  const change = (a: number, b: number) => (b ? (a - b) / Math.abs(b) : 0);

  const revenueRows = MONTHS.map((m) => ({ month: m.month, Subscriptions: m.subscriptions, "Wallet top-ups": m.topups, "Meta & AI costs": m.metaCost + m.aiCost }));
  const growthRows = MONTHS.map((m) => ({ month: m.month, "New signups": m.signups, "Paying businesses": m.paying }));

  const planMix = (["starter", "growth", "pro"] as const).map((id) => {
    const list = totals.paying.filter((b) => b.plan === id);
    return { id, count: list.length, mrr: list.reduce((s, b) => s + b.mrr, 0), trials: totals.trials.filter((b) => b.plan === id).length };
  });
  const maxMrr = Math.max(...planMix.map((p) => p.mrr), 1);
  const recent = [...businesses].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 7);
  const top = businesses
    .map((b) => ({ b, value: b.mrr + usageRevenue(b.usage).margin }))
    .sort((x, y) => y.value - x.value)
    .slice(0, 6);
  const industries = Object.entries(
    businesses.reduce<Record<string, number>>((acc, b) => ((acc[b.industry] = (acc[b.industry] ?? 0) + 1), acc), {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader title="Welcome back 👋" description={`Here is how AutoShift is doing today, ${date(new Date(ADMIN_NOW).toISOString(), true)}.`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Building2} label="Businesses" value={num(businesses.length)} hint={`${totals.paying.length} paying · ${totals.trials.length} on trial`} href="/admin/businesses" />
        <Kpi icon={Repeat} tone="sky" label="Monthly recurring revenue" value={inrShort(totals.mrr)} hint={`${inrShort(totals.mrr * 12)} a year`} delta={change(MONTHS[11].mrr, MONTHS[10].mrr)} />
        <Kpi icon={BadgeIndianRupee} tone="butter" label="Revenue, last 30 days" value={inrShort(now30.total)} hint={`${inrShort(now30.subs)} plans · ${inrShort(now30.topups)} top-ups`} delta={change(now30.total, prev30.total)} href="/admin/payments" />
        <Kpi icon={PiggyBank} tone="mint" label="Profit, last 30 days" value={inrShort(profit)} hint={`after ${inrShort(totals.usage.cost)} Meta & AI costs`} href="/admin/wallet" />
        <Kpi icon={UserPlus} tone="lilac" label="New signups, 30 days" value={num(signups30)} delta={change(signups30, signupsPrev)} href="/admin/businesses?status=trial" />
        <Kpi icon={Hourglass} tone="peach" label="Trial to paid" value={pct(totals.conversion)} hint="of businesses past their trial" />
        <Kpi icon={TrendingDown} tone="peach" label="Monthly churn" value={pct(totals.churn, 1)} hint="cancelled ÷ paying, per month" />
        <Kpi icon={Wallet} tone="sky" label="Credits held in wallets" value={inrShort(businesses.reduce((s, b) => s + Math.max(0, b.wallet), 0))} hint="prepaid, not yet spent" href="/admin/wallet" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Revenue and costs" description="Last 12 months, before GST.">
          <BarChart className="h-64" data={revenueRows} index="month" categories={["Subscriptions", "Wallet top-ups", "Meta & AI costs"]} colors={["brand", "mint", "amber"]} yAxisWidth={56} valueFormatter={(v) => inrCompact(v)} />
        </Panel>

        <Panel
          title="Needs your attention"
          description={alerts.length ? `${alerts.length} open alert${alerts.length === 1 ? "" : "s"}` : "Nothing urgent"}
          actions={
            state.dismissedAlerts.length > 0 ? (
              <button type="button" onClick={() => adminStore.set((s) => ({ ...s, dismissedAlerts: [] }))} className="text-xs font-medium text-primary hover:underline">
                Show dismissed
              </button>
            ) : undefined
          }
          bodyClassName="px-0 pb-2"
        >
          <ul className="max-h-[17rem] divide-y divide-border overflow-y-auto">
            {alerts.map((a) => (
              <li key={a.id} className="group flex items-start gap-3 px-5 py-2.5">
                <Pill tone={SEVERITY_META[a.severity].tone}>{SEVERITY_META[a.severity].label}</Pill>
                <Link href={a.href} className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground group-hover:underline">{a.title}</span>
                  <span className="block text-xs text-muted-foreground">{a.detail}</span>
                </Link>
                <button
                  type="button"
                  aria-label="Dismiss alert"
                  onClick={() => adminStore.set((s) => ({ ...s, dismissedAlerts: [...s.dismissedAlerts, a.id] }))}
                  className="rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
            {alerts.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">All clear. Nice.</li>}
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
        <Panel title="Growth" description="New signups and paying businesses each month." className="lg:col-span-2">
          <BarChart className="h-56" data={growthRows} index="month" categories={["New signups", "Paying businesses"]} colors={["violet", "brand"]} yAxisWidth={36} />
        </Panel>
        <Panel title="Plan mix" description="Paying businesses and MRR by plan.">
          <ul className="space-y-4">
            {planMix.map((p) => (
              <li key={p.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-foreground capitalize">{p.id}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {p.count} paying · {inr(p.mrr)}
                  </span>
                </div>
                <Meter value={p.mrr} max={maxMrr} className="mt-1.5" />
                <p className="mt-1 text-xs text-muted-foreground">{p.trials} on trial</p>
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">By industry</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {industries.map(([k, n]) => (
                <span key={k} className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground">
                  {INDUSTRY_LABEL[k]} · {n}
                </span>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Panel title="Newest businesses" actions={<Link href="/admin/businesses" className="text-xs font-medium text-primary hover:underline">All businesses</Link>} bodyClassName="px-0 pb-2">
          <ul className="divide-y divide-border">
            {recent.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/businesses/${b.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/50">
                  <Initials name={b.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{b.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {INDUSTRY_LABEL[b.industry]} · {b.city} · joined {relTime(b.createdAt)}
                    </span>
                  </span>
                  <StatusPill status={b.status} />
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Most valuable businesses" description="Plan revenue plus message and AI margin, per month." bodyClassName="px-0 pb-2">
          <ul className="divide-y divide-border">
            {top.map(({ b, value }, i) => (
              <li key={b.id}>
                <Link href={`/admin/businesses/${b.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/50">
                  <span className="w-5 text-sm font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                  <Initials name={b.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{b.name}</span>
                    <span className="block truncate text-xs text-muted-foreground capitalize">
                      {b.plan} · {num(b.usage.marketing + b.usage.utility + b.usage.service)} messages
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">{inr(value)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
