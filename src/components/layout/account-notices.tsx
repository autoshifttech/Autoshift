"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { shiftySays } from "@/lib/shifty/events";
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
  // Shifty mentions a low wallet once per visit (the banner stays as the real notice).
  useEffect(() => {
    if (!low) return;
    try { if (sessionStorage.getItem("shifty-wallet-low")) return; sessionStorage.setItem("shifty-wallet-low", "1"); } catch {}
    const id = setTimeout(() => shiftySays("wallet-low"), 2500);
    return () => clearTimeout(id);
  }, [low]);
  if (low) return <LowBalanceBanner />;
  // The Inbox needs every pixel for the chat, so the trial countdown stays off it.
  return pathname === "/inbox" ? null : <TrialBanner />;
}
