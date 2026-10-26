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
    <div className="mx-3 mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border border-[#f1e1ae] bg-[var(--tone-butter)] px-4 py-2 text-center text-xs text-foreground shadow-[var(--shadow-card)] sm:mx-6 sm:text-sm dark:border-transparent">
      <Clock className="size-4 text-[#7A5A0E] dark:text-amber-300" />
      <span>{t("trialBanner", { days })}</span>
      <Link href="/settings?tab=billing" className="font-semibold text-primary underline-offset-2 hover:underline">
        {t("choosePlanShort")}
      </Link>
      {!setup.completedAt && (
        <Link href="/onboarding" className="font-semibold text-primary underline-offset-2 hover:underline">
          {t("finishSetup")}
        </Link>
      )}
    </div>
  );
}
