"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Switch } from "@/components/ui/switch";
import type { Assistant } from "@/lib/assistants/model";

/** Bookings: the assistant books appointments in the chat from the Appointments page's services and hours. */
export function BookingTab({ a, set }: { a: Assistant; set: (p: Partial<Assistant>) => void }) {
  const t = useTranslations("BookingTab");
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <label className="flex min-h-11 cursor-pointer items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{t("enable")}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{t("enableHelp")}</span>
        </span>
        <Switch checked={Boolean(a.booking?.enabled)} onCheckedChange={(enabled) => set({ booking: { enabled } })} aria-label={t("enable")} />
      </label>
      <div className="rounded-xl border border-border p-4 text-sm">
        <p className="font-medium text-foreground">{t("howTitle")}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>{t("how1")}</li>
          <li>{t("how2")}</li>
          <li>{t("how3")}</li>
        </ol>
        <Link href="/appointments" className="mt-2 inline-flex min-h-11 items-center font-medium text-primary hover:underline">{t("open")}</Link>
      </div>
    </section>
  );
}
