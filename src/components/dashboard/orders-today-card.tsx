"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ShoppingBag } from "lucide-react";

import { inView, rupees, useOrders } from "@/lib/orders";

/** Dashboard card for shops: what needs doing with WhatsApp orders today. */
export function OrdersTodayCard() {
  const t = useTranslations("Dashboard.orders");
  const locale = useLocale();
  const { orders, loaded } = useOrders();
  const today = new Date().toDateString();
  const todays = orders.filter((o) => new Date(o.created_at).toDateString() === today && o.status !== "cancelled");
  const takings = todays.filter((o) => o.payment_status === "paid" || o.payment_status === "cod").reduce((sum, o) => sum + o.total_paise, 0);
  const stats = [
    { key: "today", value: String(todays.length) },
    { key: "toShip", value: String(orders.filter((o) => inView(o, "todo")).length) },
    { key: "awaiting", value: String(orders.filter((o) => inView(o, "awaiting")).length) },
    { key: "takings", value: rupees(takings, locale) },
  ];
  return (
    <section aria-labelledby="orders-today-title" className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <h2 id="orders-today-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
          <ShoppingBag className="size-4 text-primary" aria-hidden /> {t("title")}
        </h2>
        <Link href="/orders" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
          {t("open")}
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy={!loaded}>
        {stats.map((s) => (
          <div key={s.key} className="rounded-xl bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">{t(s.key)}</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-foreground">{loaded ? s.value : "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
