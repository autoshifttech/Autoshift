"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownLeft,
  Bot,
  Download,
  Info,
  KeyRound,
  Megaphone,
  MessageCircle,
  Plus,
  RefreshCw,
  Wallet as WalletIcon,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { BarChart } from "@/components/tremor/bar-chart";
import { cn } from "@/lib/utils";
import {
  CHARGE_KINDS,
  RATES,
  aiSpendByAssistant,
  balanceOf,
  formatMoney,
  runway,
  spendByKind,
  useWallet,
  walletStore,
  type Transaction,
} from "@/lib/wallet/model";
import { TopUpDialog } from "./top-up-dialog";

export const KIND_ICON: Record<Transaction["kind"], typeof Bot> = {
  topup: ArrowDownLeft,
  refund: RefreshCw,
  marketing: Megaphone,
  utility: Wrench,
  authentication: KeyRound,
  service: MessageCircle,
  ai: Bot,
};

type Filter = "all" | "credits" | "meta" | "ai";

/** Last 14 days of charges as chart rows; authentication is shown with utility. */
function dailySpendRows(txs: Transaction[], locale: string, labels: Record<"marketing" | "utility" | "ai", string>, days = 14, now = Date.now()) {
  const rows: Record<string, number | string>[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 864e5);
    const key = d.toDateString();
    const row: Record<string, number | string> = { label: d.toLocaleDateString(locale, { day: "numeric", month: "short" }) };
    for (const label of Object.values(labels)) row[label] = 0;
    for (const tx of txs) {
      if (tx.amount >= 0 || new Date(tx.at).toDateString() !== key) continue;
      const k = tx.kind === "authentication" ? "utility" : tx.kind;
      if (k !== "marketing" && k !== "utility" && k !== "ai") continue;
      row[labels[k]] = Math.round(((row[labels[k]] as number) - tx.amount) * 100) / 100;
    }
    rows.push(row);
  }
  return rows;
}
const PAGE = 12;

export function WalletPage() {
  const t = useTranslations("Wallet");
  const locale = useLocale();
  const wallet = useWallet();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);
  const balance = balanceOf(wallet.transactions);
  const low = balance < wallet.lowBalanceAlert;
  const { perDay, daysLeft } = runway(wallet.transactions);
  const spend = spendByKind(wallet.transactions);
  const totalSpend = CHARGE_KINDS.reduce((s, k) => s + spend[k].amount, 0);
  const byAssistant = aiSpendByAssistant(wallet.transactions);

  const labels = { marketing: t("kind_marketing"), utility: t("kind_utility"), ai: t("kind_ai") };
  const daily = dailySpendRows(wallet.transactions, locale, labels);

  const filtered = wallet.transactions.filter((tx) => {
    if (tx.kind === "service" && tx.amount === 0 && filter !== "meta") return false; // free service conversations: only under Meta fees
    if (filter === "credits") return tx.amount > 0;
    if (filter === "meta") return ["marketing", "utility", "authentication", "service"].includes(tx.kind);
    if (filter === "ai") return tx.kind === "ai";
    return true;
  });

  const setAuto = (patch: Partial<typeof wallet.autoRecharge>) => walletStore.set((s) => ({ ...s, autoRecharge: { ...s.autoRecharge, ...patch } }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button onClick={() => setTopUpOpen(true)} className="gap-1.5 self-start">
          <Plus className="size-4" />
          {t("topUp")}
        </Button>
      </div>

      {low && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{t("lowAlert", { amount: formatMoney(wallet.lowBalanceAlert, locale, 0) })}</span>
          <Button size="sm" onClick={() => setTopUpOpen(true)}>
            {t("topUp")}
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Balance */}
        <div className="relative overflow-hidden rounded-2xl bg-[#1E4C41] p-5 text-white shadow-[var(--shadow-card)] lg:col-span-1">
          <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-white/10" />
          <p className="flex items-center gap-2 text-sm text-white/80">
            <WalletIcon className="size-4" />
            {t("balance")}
          </p>
          <p className="mt-2 text-4xl font-bold tracking-tight">{formatMoney(balance, locale)}</p>
          <p className="mt-1 text-sm text-white/80">
            {daysLeft === null ? t("noUsage") : t("runway", { days: daysLeft, perDay: formatMoney(perDay, locale) })}
          </p>
          <Button onClick={() => setTopUpOpen(true)} className="mt-5 bg-white text-[#1E4C41] hover:bg-white/90">
            {t("addCredits")}
          </Button>
        </div>

        {/* Auto-recharge */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{t("autoTitle")}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("autoDesc")}</p>
            </div>
            <Switch checked={wallet.autoRecharge.enabled} onCheckedChange={(enabled) => setAuto({ enabled })} aria-label={t("autoTitle")} />
          </div>
          <div className={cn("mt-4 grid grid-cols-2 gap-3", !wallet.autoRecharge.enabled && "pointer-events-none opacity-50")}>
            <label className="grid content-end gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("whenBelow")}</span>
              <NativeSelect value={wallet.autoRecharge.below} onChange={(e) => setAuto({ below: Number(e.target.value) })}>
                {[100, 300, 500, 1000].map((v) => (
                  <option key={v} value={v}>
                    {formatMoney(v, locale, 0)}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="grid content-end gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("addAmount")}</span>
              <NativeSelect value={wallet.autoRecharge.amount} onChange={(e) => setAuto({ amount: Number(e.target.value) })}>
                {[500, 1000, 2000, 5000].map((v) => (
                  <option key={v} value={v}>
                    {formatMoney(v, locale, 0)}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t("autoNote")}</p>
        </div>

        {/* Low balance + what pauses */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <p className="font-semibold text-foreground">{t("alertTitle")}</p>
          <label className="mt-3 grid gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("alertBelow")}</span>
            <NativeSelect value={wallet.lowBalanceAlert} onChange={(e) => walletStore.set((s) => ({ ...s, lowBalanceAlert: Number(e.target.value) }))}>
              {[200, 500, 1000, 2000].map((v) => (
                <option key={v} value={v}>
                  {formatMoney(v, locale, 0)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <p className="mt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("zeroTitle")}</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            <li className="flex gap-2 text-foreground">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive" />
              {t("zeroPause")}
            </li>
            <li className="flex gap-2 text-foreground">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              {t("zeroKeep")}
            </li>
          </ul>
        </div>
      </div>

      {/* Spend */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold text-foreground">{t("dailySpend")}</h2>
            <span className="text-sm text-muted-foreground">{t("last14")}</span>
          </div>
          <BarChart
            className="mt-4 h-60"
            data={daily}
            index="label"
            categories={[t("kind_marketing"), t("kind_utility"), t("kind_ai")]}
            colors={["amber", "blue", "brand"]}
            type="stacked"
            yAxisWidth={64}
            valueFormatter={(v) => formatMoney(v, locale, 0)}
          />
        </section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold text-foreground">{t("spend30")}</h2>
            <span className="text-lg font-semibold text-foreground">{formatMoney(totalSpend, locale)}</span>
          </div>
          <ul className="mt-4 space-y-3">
            {CHARGE_KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              const pct = totalSpend ? Math.round((spend[k].amount / totalSpend) * 100) : 0;
              return (
                <li key={k} className="text-sm">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="flex-1 text-foreground">{t(`kind_${k}`)}</span>
                    <span className="text-muted-foreground">{t(k === "ai" ? "repliesCount" : "messagesCount", { count: spend[k].units })}</span>
                    <span className="w-20 text-right font-medium text-foreground">{formatMoney(spend[k].amount, locale)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {byAssistant.length > 0 && (
            <>
              <p className="mt-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("aiByAssistant")}</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {byAssistant.map((a) => (
                  <li key={a.assistant} className="flex justify-between gap-3">
                    <span className="text-foreground">{a.assistant}</span>
                    <span className="text-muted-foreground">
                      {t("repliesCount", { count: a.units })} · <span className="font-medium text-foreground">{formatMoney(a.amount, locale)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* Rate card */}
      <section className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-1 border-b border-border p-5 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="font-semibold text-foreground">{t("ratesTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("ratesNote")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">{t("colType")}</th>
                <th className="px-5 py-2.5 font-medium">{t("colWhen")}</th>
                <th className="px-5 py-2.5 text-right font-medium">{t("colPrice")}</th>
              </tr>
            </thead>
            <tbody>
              {RATES.map((r) => {
                const Icon = KIND_ICON[r.kind];
                return (
                  <tr key={r.kind} className="border-t border-border">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        <Icon className="size-4 text-muted-foreground" />
                        {t(`kind_${r.kind}`)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{t(`when_${r.kind}`)}</td>
                    <td className="px-5 py-3 text-right font-medium text-foreground">
                      {r.price === 0 ? t("free") : t(r.kind === "ai" ? "perReply" : "perMessage", { price: formatMoney(r.price, locale) })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Transactions */}
      <section className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-foreground">{t("historyTitle")}</h2>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "credits", "meta", "ai"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFilter(f);
                  setShown(PAGE);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {t(`filter_${f}`)}
              </button>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-border">
          {filtered.slice(0, shown).map((tx) => {
            const Icon = KIND_ICON[tx.kind];
            const credit = tx.amount > 0;
            return (
              <li key={tx.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", credit ? "bg-[var(--tone-mint)] text-primary" : "bg-muted text-muted-foreground")}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {tx.kind === "topup"
                      ? t(tx.method === "auto" ? "txAutoTopUp" : "txTopUp")
                      : tx.kind === "refund"
                        ? t("txRefund", { count: tx.units })
                        : tx.kind === "ai"
                          ? t("txAi", { count: tx.units, assistant: tx.assistant ?? "" })
                          : tx.note
                            ? t("txCampaign", { name: tx.note, count: tx.units })
                            : t("txMeta", { kind: t(`kind_${tx.kind}`), count: tx.units })}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {new Date(tx.at).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {tx.method && tx.method !== "auto" ? ` · ${t(`method_${tx.method}`)}` : ""}
                  </span>
                </span>
                <span className={cn("shrink-0 font-semibold", credit ? "text-primary" : tx.amount === 0 ? "text-muted-foreground" : "text-foreground")}>
                  {credit ? "+" : tx.amount < 0 ? "−" : ""}
                  {formatMoney(Math.abs(tx.amount), locale)}
                </span>
                {tx.kind === "topup" ? (
                  <Button variant="ghost" size="icon-sm" aria-label={t("downloadInvoice")} onClick={() => toast(t("invoiceSoon"))}>
                    <Download className="size-4" />
                  </Button>
                ) : (
                  <span className="size-7 shrink-0" aria-hidden />
                )}
              </li>
            );
          })}
        </ul>
        {filtered.length > shown && (
          <div className="border-t border-border p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => setShown(shown + PAGE)}>
              {t("showMore")}
            </Button>
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {t("footnote")}
      </p>

      <TopUpDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
    </div>
  );
}

