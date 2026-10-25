"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, Plus } from "lucide-react";

import { isoDate, useBookingState } from "@/lib/booking/model";
import { BookingDialog } from "./booking-dialog";
import { StatusChip, useDateLabel } from "./booking-ui";

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);

/** Inbox side panel: this customer's bookings, plus "Book appointment". Matched by phone number. */
export function ContactBookings({ name, phone }: { name: string; phone: string | null }) {
  const t = useTranslations("Bookings");
  const state = useBookingState();
  const label = useDateLabel();
  const [open, setOpen] = useState(false);
  const today = isoDate(new Date());
  const mine = state.bookings
    .filter((b) => digits(b.phone) && digits(b.phone) === digits(phone))
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  const upcoming = mine.filter((b) => b.date >= today && b.status !== "cancelled").reverse();
  const past = mine.filter((b) => b.date < today).slice(0, 2);

  return (
    <div>
      <div className="flex items-center justify-between px-1">
        <span className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          <CalendarDays className="h-3 w-3" />
          {t("sidebarTitle")}
        </span>
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
          <Plus className="h-3 w-3" />
          {t("book")}
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {upcoming.length === 0 && past.length === 0 && <p className="px-1 text-xs text-muted-foreground">{t("sidebarEmpty")}</p>}
        {[...upcoming, ...past].map((b) => {
          const service = state.services.find((s) => s.id === b.serviceId);
          return (
            <div key={b.id} className="rounded-lg bg-muted px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-foreground">{service?.name}</p>
                <StatusChip status={b.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {label(b.date)} · {b.start} · {state.staff.find((s) => s.id === b.staffId)?.name}
              </p>
            </div>
          );
        })}
      </div>
      {open && <BookingDialog open onOpenChange={setOpen} defaults={{ contactName: name, phone: phone ?? "" }} />}
    </div>
  );
}
