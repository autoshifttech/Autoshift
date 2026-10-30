"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { balanceOf, formatMoney, useWallet } from "@/lib/wallet/model";

/** Top bar: wallet balance, amber when it's below the low-balance alert. */
export function CreditsBadge() {
  const t = useTranslations("Wallet");
  const locale = useLocale();
  const wallet = useWallet();
  const balance = balanceOf(wallet.transactions);
  const low = balance < wallet.lowBalanceAlert;
  return (
    <Link
      href="/wallet"
      aria-label={t("badgeLabel", { amount: formatMoney(balance, locale) })}
      className={cn(
        "hidden h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors sm:inline-flex",
        low
          ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          : "liquid-glass",
      )}
    >
      <Wallet className={cn("size-3.5", low ? "" : "text-primary")} />
      {formatMoney(balance, locale)}
      <span className="font-semibold text-foreground">{t("credits")}</span>
    </Link>
  );
}

/** App-wide strip when the balance is below the alert level. */
export function LowBalanceBanner() {
  const t = useTranslations("Wallet");
  const locale = useLocale();
  const wallet = useWallet();
  const balance = balanceOf(wallet.transactions);
  if (balance >= wallet.lowBalanceAlert) return null;
  return (
    <section role="status" aria-label={t("lowShort", { amount: formatMoney(balance, locale) })} className="no-print mx-3 mt-3 flex justify-center sm:mx-6">
      <div className="inline-flex h-10 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 py-1 pr-1 pl-3.5 text-sm font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <span>{t("lowShort", { amount: formatMoney(balance, locale) })}</span>
        <Link href="/wallet" className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-xs font-bold text-primary-foreground transition-transform active:scale-95">
          {t("topUp")}
        </Link>
      </div>
    </section>
  );
}
