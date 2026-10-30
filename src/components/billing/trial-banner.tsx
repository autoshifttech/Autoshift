"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";

import { trialDaysLeft, useSubscription } from "@/lib/billing/plans";
import { useSetup } from "@/lib/workspace/setup";

/** App-wide strip: trial countdown, plus a nudge while onboarding isn't finished. */
export function TrialBanner() {
  const t = useTranslations("Billing");
  const sub = useSubscription();
  const setup = useSetup();
  if (sub.status !== "trialing") return null;
  const days = trialDaysLeft(sub);
  return (
    <section aria-label={t("trialShort", { days })} className="mx-3 mt-3 flex items-center justify-center gap-x-3 sm:mx-6">
      <div className="inline-flex h-10 items-center gap-2 rounded-full border border-[#f1e1ae] bg-[var(--tone-butter)] py-1 pr-1 pl-3.5 text-sm font-semibold text-foreground dark:border-transparent">
        <Clock className="size-4 text-[#7A5A0E] dark:text-amber-300" />
        <span>{t("trialShort", { days })}</span>
        <Link href="/settings?tab=billing" className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-xs font-bold text-primary-foreground transition-transform active:scale-95">
          {t("upgrade")}
        </Link>
      </div>
      {!setup.completedAt && (
        <Link href="/onboarding" className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
          {t("finishSetup")}
        </Link>
      )}
    </section>
  );
}
