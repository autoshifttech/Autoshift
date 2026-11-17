"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { isLive } from "@/lib/workspace/live";
import { shiftySays } from "@/lib/shifty/events";

const EVERY_MS = 60_000;

/**
 * Tells Shifty about real news while the app is open: a customer paid a payment link, or a new lead
 * (order, booking) arrived. A light check once a minute, only while the tab is visible; row-level
 * security keeps it to this business's own data.
 */
export function ShiftyWatcher() {
  const t = useTranslations("Shifty.events");
  useEffect(() => {
    if (!isLive()) return;
    const sb = createClient();
    let since = new Date().toISOString();
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState !== "visible") return;
      const from = since;
      since = new Date().toISOString();
      const [paid, leads] = await Promise.all([
        sb.from("payment_links").select("amount_paise, description").eq("status", "paid").gt("paid_at", from).order("paid_at", { ascending: false }).limit(1),
        sb.from("deals").select("title").gt("created_at", from).order("created_at", { ascending: false }).limit(1),
      ]);
      const p = paid.data?.[0];
      if (p) { shiftySays("paid", t("paidAmount", { amount: (Number(p.amount_paise) / 100).toLocaleString("en-IN") })); return; }
      const l = leads.data?.[0];
      if (l) shiftySays("lead", l.title ? t("leadNamed", { title: String(l.title).slice(0, 60) }) : undefined);
    };
    const id = setInterval(() => void check().catch(() => {}), EVERY_MS);
    return () => { stop = true; clearInterval(id); };
  }, [t]);
  return null;
}
