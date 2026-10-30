"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertOctagon, Bot, Coins, Hand, PiggyBank, Sparkles } from "lucide-react";

import { BarChart } from "@/components/tremor/bar-chart";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { AI_DAYS, AI_MODELS, seeded } from "@/lib/admin/data";
import { inr, inrShort, num, numCompact, pct } from "@/lib/admin/format";
import { useAdmin, useBusinesses } from "@/lib/admin/store";
import { DataTable, Initials, Kpi, Meter, PageHeader, Panel, td } from "./admin-ui";

type Sort = "replies" | "cost" | "margin" | "errors";

export function AiUsagePage() {
  const businesses = useBusinesses();
  const { prices } = useAdmin();
  const [sort, setSort] = useState<Sort>("replies");

  const rows = useMemo(() => {
    const r = seeded(55);
    return businesses
      .filter((b) => b.usage.ai > 0)
      .map((b) => {
        // Pro workspaces lean on the smarter model more often.
        const smartShare = b.plan === "pro" ? 0.45 + r.next() * 0.2 : b.plan === "growth" ? 0.2 + r.next() * 0.15 : 0.05 + r.next() * 0.1;
        const smart = Math.round(b.usage.ai * smartShare);
        const fast = b.usage.ai - smart;
        const cost = fast * AI_MODELS[0].costPerReply + smart * AI_MODELS[1].costPerReply;
        const charged = b.usage.ai * prices.ai;
        const errors = Math.round(b.usage.ai * (0.002 + r.next() * 0.01));
        const handoffs = Math.round(b.usage.ai * (0.06 + r.next() * 0.12));
        return { b, fast, smart, cost, charged, margin: charged - cost, errors, handoffs };
      });
  }, [businesses, prices.ai]);

  const sorted = [...rows].sort((a, b) => (sort === "replies" ? b.b.usage.ai - a.b.usage.ai : sort === "cost" ? b.cost - a.cost : sort === "margin" ? b.margin - a.margin : b.errors - a.errors));
  const replies = rows.reduce((s, x) => s + x.b.usage.ai, 0);
  const cost = rows.reduce((s, x) => s + x.cost, 0);
  const charged = rows.reduce((s, x) => s + x.charged, 0);
  const errors = rows.reduce((s, x) => s + x.errors, 0);
  const handoffs = rows.reduce((s, x) => s + x.handoffs, 0);
  const fast = rows.reduce((s, x) => s + x.fast, 0);
  const smart = rows.reduce((s, x) => s + x.smart, 0);
  const maxReplies = Math.max(...rows.map((x) => x.b.usage.ai), 1);

  const chart = AI_DAYS.map((d) => ({ day: d.day, [AI_MODELS[0].label]: d.fast, [AI_MODELS[1].label]: d.smart }));

  return (
    <>
      <PageHeader title="AI usage" description="Replies your AI assistants send for businesses: volume, cost per model, margin, errors and hand-offs to people." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Bot} label="AI replies, 30 days" value={num(replies)} />
        <Kpi icon={Coins} tone="peach" label="AI cost" value={inrShort(cost)} hint={`${inr(replies ? cost / replies : 0, 2)} per reply`} />
        <Kpi icon={Sparkles} tone="sky" label="Charged to wallets" value={inrShort(charged)} hint={`${inr(prices.ai, 2)} per reply`} />
        <Kpi icon={PiggyBank} tone="mint" label="AI margin" value={inrShort(charged - cost)} hint={charged ? pct((charged - cost) / charged) : undefined} />
        <Kpi icon={AlertOctagon} tone="butter" label="Error rate" value={pct(replies ? errors / replies : 0, 2)} hint={`${num(errors)} failed replies`} />
        <Kpi icon={Hand} tone="lilac" label="Handed to a person" value={pct(replies ? handoffs / replies : 0)} hint={`${num(handoffs)} chats`} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Replies per day" description="Last 30 days, by model.">
          <BarChart className="h-60" data={chart} index="day" categories={AI_MODELS.map((m) => m.label)} colors={["brand", "violet"]} type="stacked" yAxisWidth={44} valueFormatter={(v) => numCompact(v)} />
        </Panel>
        <Panel title="Models">
          <ul className="space-y-4">
            {AI_MODELS.map((m, i) => {
              const n = i === 0 ? fast : smart;
              return (
                <li key={m.id}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-foreground">{m.label}</span>
                    <span className="text-muted-foreground tabular-nums">{pct(replies ? n / replies : 0)}</span>
                  </div>
                  <Meter value={n} max={replies} className="mt-1.5" tone={i === 0 ? "bg-primary" : "bg-violet-500"} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {num(n)} replies · costs you {inr(m.costPerReply, 2)} each
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-5 rounded-xl bg-muted p-3 text-xs text-muted-foreground">Fast handles simple questions. Smart is used for bookings, long questions and Pro workspaces. Both are charged the same to businesses.</p>
        </Panel>
      </div>

      <Panel
        title="By business"
        actions={
          <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" size="sm" className="w-40">
            <option value="replies">Most replies</option>
            <option value="cost">Highest cost</option>
            <option value="margin">Highest margin</option>
            <option value="errors">Most errors</option>
          </NativeSelect>
        }
        bodyClassName="px-0 pb-0"
      >
        <DataTable head={["Business", "Replies", "Smart model", "Cost", "Charged", "Margin", "Errors", "Hand-offs"]} className="[&_table]:min-w-[900px]">
          {sorted.map((x) => (
            <tr key={x.b.id}>
              <td className={td}>
                <Link href={`/admin/businesses/${x.b.id}`} className="flex items-center gap-3 hover:underline">
                  <Initials name={x.b.name} className="size-8 text-xs" />
                  <span className="font-medium text-foreground">{x.b.name}</span>
                </Link>
              </td>
              <td className={cn(td, "w-40")}>
                <span className="tabular-nums">{num(x.b.usage.ai)}</span>
                <Meter value={x.b.usage.ai} max={maxReplies} className="mt-1" />
              </td>
              <td className={cn(td, "tabular-nums")}>{pct(x.smart / x.b.usage.ai)}</td>
              <td className={cn(td, "tabular-nums")}>{inr(x.cost)}</td>
              <td className={cn(td, "tabular-nums")}>{inr(x.charged)}</td>
              <td className={cn(td, "font-medium tabular-nums")}>{inr(x.margin)}</td>
              <td className={cn(td, "tabular-nums", x.errors / x.b.usage.ai > 0.01 && "text-rose-700 dark:text-rose-400")}>{num(x.errors)}</td>
              <td className={cn(td, "tabular-nums")}>{num(x.handoffs)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
