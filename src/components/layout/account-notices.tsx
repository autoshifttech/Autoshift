"use client";

import { TrialBanner } from "@/components/billing/trial-banner";
import { LowBalanceBanner } from "@/components/wallet/credits-badge";
import { balanceOf, useWallet } from "@/lib/wallet/model";

/**
 * One account notice at a time, most urgent first: a low wallet balance
 * stops AI replies and campaigns, so it outranks the trial countdown.
 */
export function AccountNotices() {
  const wallet = useWallet();
  const low = balanceOf(wallet.transactions) < wallet.lowBalanceAlert;
  return low ? <LowBalanceBanner /> : <TrialBanner />;
}
