"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Bot, MessageSquare, Sparkles, Target } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLANS, TRIAL_DAYS, planPrice, trialDaysLeft, useSubscription } from "@/lib/billing/plans";
import { formatMoney, spendByKind, useWallet } from "@/lib/wallet/model";
import { useLeads, useLeadSettings, scoreLead, temperature } from "@/lib/leads/model";
import { useSetup } from "@/lib/workspace/setup";

/** Dashboard: plan, channel status, AI spend and leads at a glance. */
export function WorkspaceSummary() {
  const t = useTranslations("Summary");
  const tb = useTranslations("Billing");
  const locale = useLocale();
  const sub = useSubscription();
  const wallet = useWallet();
  const leads = useLeads();
  const leadSettings = useLeadSettings();
  const setup = useSetup();

  const spend = spendByKind(wallet.transactions);
  const hot = leads.filter((l) => temperature(scoreLead(l.answers, leadSettings.rules), leadSettings.thresholds) === "hot").length;
  const daysLeft = trialDaysLeft(sub);
  const trial = sub.status === "trialing";
  const ring = trial ? Math.max(0, Math.min(1, daysLeft / TRIAL_DAYS)) : 1;
  const connected = setup.whatsapp === "connected";

  const stats = [
    // Wallet balance and messages handled live in the cards above.
    { href: "/wallet", icon: Bot, value: formatMoney(spend.ai.amount, locale), label: t("aiSpend") },
    { href: "/leads", icon: Target, value: String(leads.length), label: t("totalLeads", { hot }) },
  ] as { href: string; icon: typeof Bot; value: string; label: string; low?: boolean }[];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Plan */}
        <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center">
          <div className="relative size-24 shrink-0">
            <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" className="stroke-muted" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${ring * 264} 264`}
                className={trial && daysLeft <= 3 ? "stroke-destructive" : "stroke-primary"}
              />
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-foreground">{trial ? daysLeft : "✓"}</span>
              <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{trial ? t("daysLeft") : t("active")}</span>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("subscription")}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold text-foreground">
              {tb(`plan_${sub.plan}`)}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  trial ? "bg-[var(--tone-butter)] text-[#7A5A0E] dark:text-amber-300" : sub.status === "active" ? "bg-[var(--tone-mint)] text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {tb(`status_${sub.status}`)}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {trial
                ? t("trialEnds", { date: new Date(sub.trialEndsAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) })
                : sub.renewsAt
                  ? t("renews", { price: formatMoney(planPrice(PLANS[sub.plan], sub.cycle), locale, 0), date: new Date(sub.renewsAt).toLocaleDateString(locale, { day: "numeric", month: "short" }) })
                  : tb("cancelledStatus")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/settings?tab=billing" className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}>
                <Sparkles className="size-3.5" />
                {trial ? t("choosePlan") : t("managePlan")}
              </Link>
              <Link href="/settings?tab=billing" className={buttonVariants({ size: "sm", variant: "outline" })}>
                {t("viewUsage")}
              </Link>
            </div>
          </div>
        </section>

        {/* Channels */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <p className="font-semibold text-foreground">{t("channels")}</p>
          <p className="text-sm text-muted-foreground">{t("channelsDesc")}</p>
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-border p-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#128C7E]">
              <MessageSquare className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-foreground">WhatsApp</span>
              <span className={cn("flex items-center gap-1.5 text-xs", connected ? "text-primary" : "text-muted-foreground")}>
                <span className={cn("size-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-muted-foreground/50")} />
                {connected ? setup.number?.displayPhoneNumber ?? t("connected") : t("notConnected")}
              </span>
            </span>
            <Link href="/settings?tab=whatsapp" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              {connected ? t("manage") : t("connect")}
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {stats.map(({ href, icon: Icon, value, label, low }) => (
          <Link
            key={label}
            href={href}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:border-primary/40"
          >
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", low ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200" : "bg-[var(--tone-mint)] text-primary")}>
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-bold text-foreground">{value}</span>
              <span className="block truncate text-xs text-muted-foreground">{label}</span>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </div>
  );
}
