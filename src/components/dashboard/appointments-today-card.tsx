"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";

import { inView, useAppointments } from "@/lib/appointments";

/** Dashboard card for clinics, salons …: today's bookings and the next one. */
export function AppointmentsTodayCard() {
  const t = useTranslations("Dashboard.appointments");
  const locale = useLocale();
  const { items, loaded } = useAppointments();
  // Taken once per mount; the list refreshes every 30 seconds anyway.
  const [now] = useState(() => Date.now());
  const today = items.filter((a) => inView(a, "today"));
  const next = items.find((a) => a.status === "booked" && new Date(a.starts_at).getTime() >= now);
  const stats = [
    { key: "today", value: String(today.length) },
    { key: "done", value: String(today.filter((a) => a.status === "completed").length) },
    { key: "upcoming", value: String(items.filter((a) => inView(a, "upcoming")).length) },
  ];
  return (
    <section aria-labelledby="appts-today-title" className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <h2 id="appts-today-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
          <CalendarDays className="size-4 text-primary" aria-hidden /> {t("title")}
        </h2>
        <Link href="/appointments" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">{t("open")}</Link>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3" aria-busy={!loaded}>
        {stats.map((s) => (
          <div key={s.key} className="rounded-xl bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">{t(s.key)}</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-foreground">{loaded ? s.value : "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">
        {next ? t("next", { name: next.customer_name || "—", service: next.service, when: new Date(next.starts_at).toLocaleString(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }) }) : t("none")}
      </p>
    </section>
  );
}
