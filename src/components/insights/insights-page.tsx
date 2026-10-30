"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, Bot, CalendarCheck, Download, Printer, IndianRupee, MessageSquare, Target, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BarChart } from "@/components/tremor/bar-chart";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/wallet/model";
import { FunnelChart, RouteCard } from "./journey-charts";
import { RANGES, buildInsights, change, type Range } from "@/lib/insights/model";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium", up ? "bg-[var(--tone-mint)] text-primary" : "bg-destructive/10 text-destructive")}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(value)}%
    </span>
  );
}

export function InsightsPage() {
  const t = useTranslations("Insights");
  const tl = useTranslations("LeadsPage");
  const tb = useTranslations("Bookings");
  const locale = useLocale();
  const [range, setRange] = useState<Range>(30);
  const data = buildInsights(range);
  const label = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const tt = data.totals;
  const max = Math.max(...data.heat.flat());

  const conv = data.days.map((d) => ({ label: label(d.date), [t("ai")]: d.aiConversations, [t("team")]: d.teamConversations }));
  const leads = data.days.map((d) => ({ label: label(d.date), [t("hot")]: d.hot, [t("warm")]: d.warm, [t("cold")]: d.cold }));

  const kpis = [
    { icon: MessageSquare, label: t("kpiConversations"), value: tt.conversations.toLocaleString(locale), delta: change(tt.conversations, tt.previous.conversations) },
    { icon: Bot, label: t("kpiAiResolved"), value: `${Math.round((tt.aiResolved / tt.conversations) * 100)}%`, delta: null },
    { icon: Timer, label: t("kpiReply"), value: t("seconds", { count: tt.medianReplySec }), delta: null },
    { icon: Target, label: t("kpiLeads"), value: tt.leads.toLocaleString(locale), delta: change(tt.leads, tt.previous.leads) },
    { icon: CalendarCheck, label: t("kpiBookings"), value: tt.bookings.toLocaleString(locale), delta: change(tt.bookings, tt.previous.bookings) },
    { icon: IndianRupee, label: t("kpiRevenue"), value: formatMoney(tt.revenue, locale, 0), delta: change(tt.revenue, tt.previous.revenue) },
  ];

  const exportCsv = () => {
    const head = ["Date", "AI conversations", "Team conversations", "Hot leads", "Warm leads", "Cold leads", "Bookings"];
    const rows = data.days.map((d) => [d.date, d.aiConversations, d.teamConversations, d.hot, d.warm, d.cold, d.bookings]);
    const url = URL.createObjectURL(new Blob([[head, ...rows].map((r) => r.join(",")).join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `autoshift-insights-${range}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("exported"));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="sr-only">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <div role="tablist" className="inline-flex rounded-full bg-muted p-1 text-xs">
            {RANGES.map((r) => (
              <button
                key={r}
                role="tab"
                type="button"
                aria-selected={range === r}
                onClick={() => setRange(r)}
                className={cn("rounded-full px-3 py-1 font-medium", range === r ? "bg-card text-foreground shadow-[var(--shadow-card)]" : "text-muted-foreground")}
              >
                {t("days", { count: r })}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="no-print gap-1.5" onClick={() => window.print()}>
            <Printer className="size-3.5" />
            {t("print")}
          </Button>
          <Button variant="outline" size="sm" className="no-print gap-1.5" onClick={exportCsv}>
            <Download className="size-3.5" />
            {t("export")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map(({ icon: Icon, label: l, value, delta }) => (
          <div key={l} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <Icon className="size-4 text-muted-foreground" />
              <Delta value={delta} />
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold text-foreground">{t("convTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("convDesc")}</p>
          <BarChart className="mt-4 h-60" data={conv} index="label" categories={[t("ai"), t("team")]} colors={["brand", "mint"]} type="stacked" yAxisWidth={44} valueFormatter={(v) => v.toLocaleString(locale)} />
        </section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold text-foreground">{t("leadsTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("leadsDesc")}</p>
          <BarChart className="mt-4 h-60" data={leads} index="label" categories={[t("hot"), t("warm"), t("cold")]} colors={["peach", "butter", "sky"]} type="stacked" yAxisWidth={44} valueFormatter={(v) => v.toLocaleString(locale)} />
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-semibold text-foreground">{t("routeTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("routeDesc")}</p>
        <RouteCard stages={data.funnel} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold text-foreground">{t("funnelTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("funnelDesc")}</p>
          <FunnelChart stages={data.funnel} />
        </section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold text-foreground">{t("sourcesTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("sourcesDesc")}</p>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">{t("colSource")}</th>
                <th className="pb-2 text-right font-medium">{t("colLeads")}</th>
                <th className="pb-2 text-right font-medium">{t("colWon")}</th>
                <th className="pb-2 text-right font-medium">{t("colRate")}</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.source} className="border-t border-border">
                  <td className="py-2.5 text-foreground">{tl(`source_${s.source}`)}</td>
                  <td className="py-2.5 text-right text-foreground">{s.leads}</td>
                  <td className="py-2.5 text-right text-foreground">{s.won}</td>
                  <td className="py-2.5 text-right font-medium text-primary">{s.leads ? Math.round((s.won / s.leads) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-x-auto rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold text-foreground">{t("assistantsTitle")}</h2>
          <table className="mt-4 w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">{t("colAssistant")}</th>
                <th className="pb-2 text-right font-medium">{t("colReplies")}</th>
                <th className="pb-2 text-right font-medium">{t("colResolved")}</th>
                <th className="pb-2 text-right font-medium">{t("colLeads")}</th>
                <th className="pb-2 text-right font-medium">{t("colBookings")}</th>
                <th className="pb-2 text-right font-medium">{t("colHandoffs")}</th>
              </tr>
            </thead>
            <tbody>
              {data.assistants.map((a) => (
                <tr key={a.name} className="border-t border-border">
                  <td className="py-2.5 font-medium text-foreground">{a.name}</td>
                  <td className="py-2.5 text-right">{a.replies.toLocaleString(locale)}</td>
                  <td className="py-2.5 text-right text-primary">{a.resolved}%</td>
                  <td className="py-2.5 text-right">{a.leads}</td>
                  <td className="py-2.5 text-right">{a.bookings}</td>
                  <td className="py-2.5 text-right">{a.handoffs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="overflow-x-auto rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold text-foreground">{t("campaignsTitle")}</h2>
          <table className="mt-4 w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">{t("colCampaign")}</th>
                <th className="pb-2 text-right font-medium">{t("colSent")}</th>
                <th className="pb-2 text-right font-medium">{t("colRead")}</th>
                <th className="pb-2 text-right font-medium">{t("colReplied")}</th>
                <th className="pb-2 text-right font-medium">{t("colBookings")}</th>
                <th className="pb-2 text-right font-medium">{t("colCost")}</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={c.name} className="border-t border-border">
                  <td className="py-2.5">
                    <span className="block font-medium text-foreground">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{t(`kind_${c.kind}`)}</span>
                  </td>
                  <td className="py-2.5 text-right">{c.sent.toLocaleString(locale)}</td>
                  <td className="py-2.5 text-right">{c.read}%</td>
                  <td className="py-2.5 text-right">{c.replied}%</td>
                  <td className="py-2.5 text-right">{c.booked}</td>
                  <td className="py-2.5 text-right">{formatMoney(c.cost, locale, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="overflow-x-auto rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-semibold text-foreground">{t("heatTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("heatDesc")}</p>
        <div className="mt-4 min-w-[640px]">
          <div className="grid grid-cols-[56px_repeat(24,minmax(0,1fr))] gap-1">
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center text-xs text-muted-foreground">
                {h % 3 === 0 ? h : ""}
              </span>
            ))}
            {data.heat.map((row, d) => (
              <div key={d} className="contents">
                <span className="pr-2 text-right text-xs text-muted-foreground">{tb(`weekday_${WEEKDAYS[d]}`).slice(0, 3)}</span>
                {row.map((v, h) => (
                  <span
                    key={h}
                    title={t("heatCell", { count: v, hour: h })}
                    className="h-6 rounded-[4px] bg-primary"
                    style={{ opacity: max ? 0.08 + (v / max) * 0.92 : 0.08 }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
