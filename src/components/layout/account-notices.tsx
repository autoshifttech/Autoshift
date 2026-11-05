"use client";

import { usePathname } from "next/navigation";
import { TrialBanner } from "@/components/billing/trial-banner";
import { LowBalanceBanner } from "@/components/wallet/credits-badge";
import { balanceOf, useWallet } from "@/lib/wallet/model";

/**
 * One account notice at a time, most urgent first: a low wallet balance
 * stops AI replies and campaigns, so it outranks the trial countdown (which the Inbox skips).
 */
export function AccountNotices() {
  const wallet = useWallet();
  const pathname = usePathname();
  const low = balanceOf(wallet.transactions) < wallet.lowBalanceAlert;
  if (low) return <LowBalanceBanner />;
  // The Inbox needs every pixel for the chat, so the trial countdown stays off it.
  return pathname === "/inbox" ? null : <TrialBanner />;
}
