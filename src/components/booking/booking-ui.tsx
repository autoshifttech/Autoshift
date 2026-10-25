"use client";

import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { BookingStatus } from "@/lib/booking/model";

export const STATUS_TONE: Record<BookingStatus, string> = {
  confirmed: "bg-[var(--tone-mint)] text-primary",
  pending: "bg-[var(--tone-butter)] text-[#7A5A0E] dark:text-amber-300",
  completed: "bg-[var(--tone-sky)] text-[#24508F] dark:text-sky-300",
  cancelled: "bg-muted text-muted-foreground line-through",
  no_show: "bg-destructive/10 text-destructive",
};

export function StatusChip({ status, className }: { status: BookingStatus; className?: string }) {
  const t = useTranslations("Bookings");
  return (
    <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[status], className)}>
      {t(`status_${status}`)}
    </span>
  );
}

/** Width for NativeSelect dropdowns in forms (the look comes from the component). */
export const selectClass = "w-full";

/** "Mon, 27 Oct" in the viewer's locale. */
export function useDateLabel() {
  const locale = useLocale();
  return (date: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(locale, opts);
}
