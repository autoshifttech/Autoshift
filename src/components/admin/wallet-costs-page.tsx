"use client";

import Link from "next/link";
import { Bot, Coins, HandCoins, Landmark, PiggyBank, Wallet } from "lucide-react";

import { BarChart } from "@/components/tremor/bar-chart";
import { cn } from "@/lib/utils";
import { MONTHS, UNIT_ECONOMICS, usageRevenue, type Usage } from "@/lib/admin/data";
import { inr, inrCompact, inrShort, num, pct } from "@/lib/admin/format";
import { useAdmin, useBusinesses } from "@/lib/admin/store";
import { DataTable, Initials, Kpi, Meter, PageHeader, Panel, StatusPill, td } from "./admin-ui";

export function WalletCostsPage() {
  const businesses = useBusinesses();
  const { prices, alerts } = useAdmin();
  const kinds = Object.keys(UNIT_ECONOMICS) as (keyof Usage)[];

  const totals = kinds.map((k) => {
    const units = businesses.reduce((s, b) => s + b.usage[k], 0);
    const price = prices[k];
    const cost = UNIT_ECONOMICS[k].cost;
    return { k, units, price, cost, charged: units * price, paid: units * cost, margin: units * (price - cost) };
  });
  const charged = totals.reduce((s, t) => s + t.charged, 0);
  const metaPaid = totals.filter((t) => t.k !== "ai").reduce((s, t) => s + t.paid, 0);
  const aiPaid = totals.find((t) => t.k === "ai")!.paid;
  const margin = charged - metaPaid - aiPaid;
  const held = businesses.reduce((s, b) => s + Math.max(0, b.wallet), 0);
  const topups30 = MONTHS[11].topups;

  const live = businesses.filter((b) => b.status === "active" || b.status === "past_due");
  const low = live.filter((b) => b.wallet < alerts.lowWalletBelow).sort((a, b) => a.wallet - b.wallet);
  const spenders = live
    .map((b) => ({ b, ...usageRevenue(b.usage) }))
    .sort((x, y) => y.charged - x.charged)
    .slice(0, 8);
  const maxSpend = spenders[0]?.charged ?? 1;

  const rows = MONTHS.map((m) => ({ month: m.month, "Top-ups collected": m.topups, "Paid to Meta": m.metaCost, "Paid for AI": m.aiCost }));

  return (
    <>
      <PageHeader title="Wallet & costs" description="Money businesses load into their wallets, what you pay Meta and the AI provider for it, and the margin you keep." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={HandCoins} label="Top-ups collected" value={inrShort(topups30)} hint="this month" />
        <Kpi icon={Coins} tone="sky" label="Spent by businesses" value={inrShort(charged)} hint="last 30 days" />
        <Kpi icon={Landmark} tone="peach" label="Paid to Meta" value={inrShort(metaPaid)} hint="message fees" />
        <Kpi icon={Bot} tone="butter" label="Paid for AI" value={inrShort(aiPaid)} hint="assistant replies" />
        <Kpi icon={PiggyBank} tone="mint" label="Your margin" value={inrShort(margin)} hint={charged ? `${pct(margin / charged)} of spend` : undefined} />
        <Kpi icon={Wallet} tone="lilac" label="Credits held" value={inrShort(held)} hint="owed to businesses as service" />
      </div>

      <Panel title="Top-ups vs costs" description="Last 12 months. Costs should stay well under top-ups.">
        <BarChart className="h-60" data={rows} index="month" categories={["Top-ups collected", "Paid to Meta", "Paid for AI"]} colors={["brand", "amber", "violet"]} yAxisWidth={56} valueFormatter={inrCompact} />
      </Panel>

      <Panel
        title="Margin by message type"
        description="Last 30 days across all businesses."
        actions={
          <Link href="/admin/plans#rates" className="text-xs font-medium text-primary hover:underline">
            Change prices
          </Link>
        }
        bodyClassName="px-0 pb-0"
      >
        <DataTable head={["Type", "Units", "You charge", "You pay", "Margin each", "Charged", "Margin", "Margin %"]}>
          {totals.map((t) => (
            <tr key={t.k}>
              <td className={cn(td, "font-medium")}>{UNIT_ECONOMICS[t.k].label}</td>
              <td className={cn(td, "tabular-nums")}>{num(t.units)}</td>
              <td className={cn(td, "tabular-nums")}>{inr(t.price, 2)}</td>
              <td className={cn(td, "tabular-nums text-muted-foreground")}>{inr(t.cost, 2)}</td>
              <td className={cn(td, "tabular-nums")}>{inr(t.price - t.cost, 2)}</td>
              <td className={cn(td, "tabular-nums")}>{inr(t.charged)}</td>
              <td className={cn(td, "font-semibold tabular-nums")}>{inr(t.margin)}</td>
              <td className={cn(td, "tabular-nums")}>{t.price ? pct((t.price - t.cost) / t.price) : "free"}</td>
            </tr>
          ))}
          <tr className="bg-muted/40 font-semibold">
            <td className={td}>Total</td>
            <td className={cn(td, "tabular-nums")}>{num(totals.reduce((s, t) => s + t.units, 0))}</td>
            <td className={td} />
            <td className={td} />
            <td className={td} />
            <td className={cn(td, "tabular-nums")}>{inr(charged)}</td>
            <td className={cn(td, "tabular-nums")}>{inr(margin)}</td>
            <td className={cn(td, "tabular-nums")}>{charged ? pct(margin / charged) : "—"}</td>
          </tr>
        </DataTable>
      </Panel>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Panel title="Low or negative wallets" description={`Paying businesses under ${inr(alerts.lowWalletBelow)}. Their messages stop when credits run out.`} bodyClassName="px-0 pb-2">
          <ul className="divide-y divide-border">
            {low.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/businesses/${b.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/50">
                  <Initials name={b.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{b.name}</span>
                    <span className="mt-0.5 block">
                      <StatusPill status={b.status} />
                    </span>
                  </span>
                  <span className={cn("text-sm font-semibold tabular-nums", b.wallet < 0 ? "text-rose-700 dark:text-rose-400" : "text-amber-700 dark:text-amber-400")}>{inr(b.wallet, 2)}</span>
                </Link>
              </li>
            ))}
            {low.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">Every paying business has enough credits.</li>}
          </ul>
        </Panel>
        <Panel title="Biggest spenders" description="Charged from wallets in the last 30 days." bodyClassName="px-0 pb-2">
          <ul className="divide-y divide-border">
            {spenders.map(({ b, charged: c, margin: m }) => (
              <li key={b.id}>
                <Link href={`/admin/businesses/${b.id}`} className="block px-5 py-2.5 hover:bg-muted/50">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-foreground">{b.name}</span>
                    <span className="shrink-0 tabular-nums">
                      {inr(c)} <span className="text-xs text-muted-foreground">· {inr(m)} margin</span>
                    </span>
                  </div>
                  <Meter value={c} max={maxSpend} className="mt-1.5" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
