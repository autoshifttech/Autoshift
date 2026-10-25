"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSetup } from "@/lib/workspace/setup";
import {
  addDays,
  availableSlots,
  bookingStore,
  isoDate,
  renderConfirmation,
  useBookingState,
  type Booking,
} from "@/lib/booking/model";
import { selectClass, useDateLabel } from "./booking-ui";
import { Bubble, WhatsAppPreview } from "./whatsapp-preview";
import { NativeSelect } from "@/components/ui/native-select"

/**
 * New booking, or reschedule when `booking` is given. Shows only free
 * slots and previews the WhatsApp confirmation the customer receives.
 */
export function BookingDialog({
  open,
  onOpenChange,
  booking,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking?: Booking;
  defaults?: { contactName?: string; phone?: string; date?: string };
}) {
  const t = useTranslations("Bookings");
  const state = useBookingState();
  const setup = useSetup();
  const label = useDateLabel();
  const services = state.services.filter((s) => s.active);
  const today = isoDate(new Date());

  const [name, setName] = useState(booking?.contactName ?? defaults?.contactName ?? "");
  const [phone, setPhone] = useState(booking?.phone ?? defaults?.phone ?? "");
  const [serviceId, setServiceId] = useState(booking?.serviceId ?? services[0]?.id ?? "");
  const service = state.services.find((s) => s.id === serviceId);
  const staffOptions = state.staff.filter((st) => service?.staffIds.includes(st.id));
  const [staffId, setStaffId] = useState(booking?.staffId ?? staffOptions[0]?.id ?? "");
  const staff = state.staff.find((s) => s.id === staffId) ?? staffOptions[0];
  const [date, setDate] = useState(booking?.date ?? defaults?.date ?? today);
  const [time, setTime] = useState<string | null>(null);
  const [notes, setNotes] = useState(booking?.notes ?? "");
  const [tried, setTried] = useState(false);

  // A rescheduled booking shouldn't block its own old slot.
  const others = booking ? { ...state, bookings: state.bookings.filter((b) => b.id !== booking.id) } : state;
  const slots = service && staff ? availableSlots(others, service, staff, date) : [];

  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const valid = name.trim() && phone.trim() && service && staff && time;

  const preview = renderConfirmation(state.rules.confirmationMessage, {
    name: name.split(" ")[0] || t("customer"),
    service: service?.name ?? "",
    staff: staff?.name ?? "",
    date: label(date, { weekday: "long", day: "numeric", month: "long" }),
    time: time ?? "—",
    business: setup.business.name || "AutoShift",
  });

  const save = () => {
    setTried(true);
    if (!valid || !service || !staff || !time) return;
    bookingStore.set((s) => ({
      ...s,
      bookings: booking
        ? s.bookings.map((b) => (b.id === booking.id ? { ...b, contactName: name, phone, serviceId, staffId: staff.id, date, start: time, notes, status: "confirmed" } : b))
        : [
            ...s.bookings,
            { id: `bk${Date.now()}`, contactName: name, phone, serviceId, staffId: staff.id, date, start: time, status: "confirmed", source: "staff", notes, createdAt: new Date().toISOString() },
          ],
    }));
    toast.success(booking ? t("rescheduledToast") : t("createdToast"), { description: t("confirmationSentToast") });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{booking ? t("rescheduleTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{t("newDesc")}</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="bk-name">{t("customerName")}</Label>
                <Input id="bk-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={tried && !name.trim()} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bk-phone">{t("whatsappNumber")}</Label>
                <Input id="bk-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" aria-invalid={tried && !phone.trim()} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bk-service">{t("service")}</Label>
                <NativeSelect
                  id="bk-service"
                  className={selectClass}
                  value={serviceId}
                  onChange={(e) => {
                    setServiceId(e.target.value);
                    const next = state.services.find((s) => s.id === e.target.value);
                    if (next && !next.staffIds.includes(staffId)) setStaffId(next.staffIds[0] ?? "");
                    setTime(null);
                  }}
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {t("minutes", { count: s.durationMin })}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bk-staff">{t("staff")}</Label>
                <NativeSelect
                  id="bk-staff"
                  className={selectClass}
                  value={staff?.id ?? ""}
                  onChange={(e) => {
                    setStaffId(e.target.value);
                    setTime(null);
                  }}
                >
                  {staffOptions.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">{t("date")}</p>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {days.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDate(d);
                      setTime(null);
                    }}
                    className={cn(
                      "flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 text-xs transition-colors",
                      d === date ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                    )}
                  >
                    <span className={d === date ? "" : "text-muted-foreground"}>{label(d, { weekday: "short" })}</span>
                    <span className="text-base font-semibold">{label(d, { day: "numeric" })}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">
                {t("freeSlots")} <span className="font-normal text-muted-foreground">· {label(date)}</span>
              </p>
              {slots.length === 0 ? (
                <p className="rounded-xl bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">{t("noSlots")}</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {slots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTime(s)}
                      className={cn(
                        "rounded-lg border py-1.5 text-sm transition-colors",
                        time === s ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:bg-muted",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {tried && !time && <p className="mt-1.5 text-xs text-destructive">{t("pickSlot")}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="bk-notes">{t("notes")}</Label>
              <Textarea id="bk-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("notesPh")} />
            </div>
          </div>

          <div className="min-w-0">
            <p className="mb-2 text-sm font-medium text-foreground">{t("customerSees")}</p>
            <WhatsAppPreview title={setup.business.displayName || setup.business.name || "AutoShift"}>
              <Bubble from="business" time={time ?? undefined}>
                {preview}
              </Bubble>
            </WhatsAppPreview>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={save}>{booking ? t("saveReschedule") : t("createBooking")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
