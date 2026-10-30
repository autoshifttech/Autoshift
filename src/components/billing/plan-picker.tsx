"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RollingNumber } from "@/components/motion/rolling-number";
import { cn } from "@/lib/utils";
import {
  PLANS,
  PLAN_IDS,
  TRIAL_DAYS,
  formatInr,
  monthlyEquivalent,
  type BillingCycle,
  type Plan,
  type PlanId,
} from "@/lib/billing/plans";

export function CycleToggle({ cycle, onChange }: { cycle: BillingCycle; onChange: (c: BillingCycle) => void }) {
  const t = useTranslations("Billing");
  return (
    <div role="radiogroup" aria-label={t("cycleLabel")} className="inline-flex rounded-full bg-muted p-1 text-sm">
      {(["monthly", "yearly"] as const).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={cycle === c}
          onClick={() => onChange(c)}
          className={cn(
            "rounded-full px-4 py-1.5 font-medium transition-colors",
            cycle === c ? "bg-card text-foreground shadow-[var(--shadow-card)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(c)}
          {c === "yearly" && <span className="ml-1.5 text-xs text-primary">{t("yearlySave")}</span>}
        </button>
      ))}
    </div>
  );
}

function limit(t: ReturnType<typeof useTranslations>, value: number | null, key: string) {
  return value === null ? t(`${key}Unlimited`) : t(key, { count: value });
}

export function planFeatures(t: ReturnType<typeof useTranslations>, plan: Plan): string[] {
  return [
    limit(t, plan.seats, "featSeats"),
    limit(t, plan.contacts, "featContacts"),
    t("featAiReplies", { count: plan.aiReplies }),
    limit(t, plan.bookingStaff, "featBooking"),
    ...(plan.id !== "starter" ? [t("featLeadScoring")] : []),
    ...(plan.id === "pro" ? [t("featPriority")] : []),
  ];
}

/** Three plan cards. `current` marks the active plan; `onSelect` fires on the card button. */
export function PlanPicker({
  cycle,
  selected,
  current,
  onSelect,
  actionLabel,
}: {
  cycle: BillingCycle;
  selected?: PlanId;
  current?: PlanId;
  onSelect: (plan: PlanId) => void;
  actionLabel?: (plan: PlanId) => string;
}) {
  const t = useTranslations("Billing");
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {PLAN_IDS.map((id) => {
        const plan = PLANS[id];
        const isSelected = selected === id;
        return (
          <div
            key={id}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)] transition-colors",
              isSelected ? "border-primary ring-2 ring-primary/20" : "border-border",
            )}
          >
            {plan.popular && (
              <span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                {t("popular")}
              </span>
            )}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">{t(`plan_${id}`)}</h3>
              {current === id && (
                <span className="rounded-full bg-[var(--tone-mint)] px-2 py-0.5 text-xs font-medium text-primary">{t("currentPlan")}</span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t(`planDesc_${id}`)}</p>
            <p className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight text-foreground"><RollingNumber>{formatInr(monthlyEquivalent(plan, cycle))}</RollingNumber></span>
              <span className="text-sm text-muted-foreground">{t("perMonth")}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {cycle === "yearly" ? t("billedYearly", { amount: formatInr(plan.monthly * 10) }) : t("billedMonthly")} · {t("plusGst")}
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-foreground">
              {planFeatures(t, plan).map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              className="mt-5 w-full"
              variant={isSelected || plan.popular ? "default" : "outline"}
              onClick={() => onSelect(id)}
              disabled={current === id}
            >
              {actionLabel ? actionLabel(id) : t("startTrial", { days: TRIAL_DAYS })}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
