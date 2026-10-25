"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarOff, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useSetup } from "@/lib/workspace/setup";
import { WEEKDAYS, bookingStore, defaultHours, isoDate, useBookingState, type WeeklyHours } from "@/lib/booking/model";
import { useDateLabel } from "./booking-ui";

const timeInput = "h-8 w-[6.5rem] rounded-lg border border-input bg-card px-2 text-sm text-foreground dark:bg-input/30";

function HoursEditor({ hours, onChange }: { hours: WeeklyHours; onChange: (h: WeeklyHours) => void }) {
  const t = useTranslations("Bookings");
  const set = (day: keyof WeeklyHours, patch: Partial<WeeklyHours[0]>) => onChange({ ...hours, [day]: { ...hours[day], ...patch } });
  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {WEEKDAYS.map((d) => {
        const day = hours[d];
        return (
          <div key={d} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Switch checked={day.open} onCheckedChange={(open) => set(d, { open })} aria-label={t(`weekday_${d}`)} />
            <span className={cn("w-24 text-sm font-medium", day.open ? "text-foreground" : "text-muted-foreground")}>{t(`weekday_${d}`)}</span>
            {day.open ? (
              <div className="flex flex-wrap items-center gap-2">
                {day.ranges.map((r, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <input type="time" className={timeInput} value={r.start} aria-label={t("opens")} onChange={(e) => set(d, { ranges: day.ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} />
                    <span className="text-muted-foreground">–</span>
                    <input type="time" className={timeInput} value={r.end} aria-label={t("closes")} onChange={(e) => set(d, { ranges: day.ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} />
                    {day.ranges.length > 1 && (
                      <Button variant="ghost" size="icon-sm" aria-label={t("removeRange")} onClick={() => set(d, { ranges: day.ranges.filter((_, j) => j !== i) })}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </span>
                ))}
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => set(d, { ranges: [...day.ranges, { start: "17:00", end: "20:00" }] })}>
                  <Plus className="size-3.5" />
                  {t("addRange")}
                </Button>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">{t("closed")}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AvailabilityPanel() {
  const t = useTranslations("Bookings");
  const state = useBookingState();
  const setup = useSetup();
  const label = useDateLabel();
  const [staffId, setStaffId] = useState(state.staff[0]?.id ?? "");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayLabel, setHolidayLabel] = useState("");
  const staff = state.staff.find((s) => s.id === staffId);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-foreground">{t("hoursTitle")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("hoursDesc", { tz: setup.business.timeZone })}</p>
          <HoursEditor hours={state.hours} onChange={(hours) => bookingStore.set((s) => ({ ...s, hours }))} />
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">{t("staffHoursTitle")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("staffHoursDesc")}</p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {state.staff.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStaffId(st.id)}
                className={cn("rounded-full border px-3 py-1 text-sm", staffId === st.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}
              >
                {st.name}
              </button>
            ))}
          </div>
          {staff && (
            <>
              <label className="mb-3 flex items-center gap-2.5 text-sm text-foreground">
                <Switch
                  checked={!staff.hours}
                  onCheckedChange={(same) =>
                    bookingStore.set((s) => ({ ...s, staff: s.staff.map((x) => (x.id === staff.id ? { ...x, hours: same ? null : structuredClone(s.hours) } : x)) }))
                  }
                />
                {t("sameAsBusiness")}
              </label>
              {staff.hours && (
                <HoursEditor
                  hours={staff.hours}
                  onChange={(hours) => bookingStore.set((s) => ({ ...s, staff: s.staff.map((x) => (x.id === staff.id ? { ...x, hours } : x)) }))}
                />
              )}
            </>
          )}
        </section>
      </div>

      <div className="space-y-8">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground">{t("breaksTitle")}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t("breaksDesc")}</p>
          <div className="space-y-2">
            {state.breaks.map((br, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input type="time" className={timeInput} value={br.start} aria-label={t("breakStart")} onChange={(e) => bookingStore.set((s) => ({ ...s, breaks: s.breaks.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) }))} />
                <span className="text-muted-foreground">–</span>
                <input type="time" className={timeInput} value={br.end} aria-label={t("breakEnd")} onChange={(e) => bookingStore.set((s) => ({ ...s, breaks: s.breaks.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) }))} />
                <Button variant="ghost" size="icon-sm" aria-label={t("removeBreak")} onClick={() => bookingStore.set((s) => ({ ...s, breaks: s.breaks.filter((_, j) => j !== i) }))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1" onClick={() => bookingStore.set((s) => ({ ...s, breaks: [...s.breaks, { start: "16:00", end: "16:15" }] }))}>
              <Plus className="size-3.5" />
              {t("addBreak")}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground">{t("holidaysTitle")}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t("holidaysDesc")}</p>
          <ul className="space-y-2">
            {state.holidays.map((h) => (
              <li key={h.date} className="flex items-center gap-2.5 rounded-xl bg-muted/60 px-3 py-2 text-sm">
                <CalendarOff className="size-4 text-muted-foreground" />
                <span className="flex-1 text-foreground">
                  {h.label} <span className="text-muted-foreground">· {label(h.date, { day: "numeric", month: "short", year: "numeric" })}</span>
                </span>
                <Button variant="ghost" size="icon-sm" aria-label={t("removeHoliday")} onClick={() => bookingStore.set((s) => ({ ...s, holidays: s.holidays.filter((x) => x.date !== h.date) }))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!holidayDate) return;
              bookingStore.set((s) => ({ ...s, holidays: [...s.holidays.filter((x) => x.date !== holidayDate), { date: holidayDate, label: holidayLabel.trim() || t("closed") }].sort((a, b) => a.date.localeCompare(b.date)) }));
              setHolidayDate("");
              setHolidayLabel("");
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" min={isoDate(new Date())} value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} aria-label={t("holidayDate")} />
              <Input value={holidayLabel} onChange={(e) => setHolidayLabel(e.target.value)} placeholder={t("holidayLabelPh")} aria-label={t("holidayLabelPh")} />
            </div>
            <Button type="submit" variant="outline" size="sm" className="w-fit gap-1">
              <Plus className="size-3.5" />
              {t("addHoliday")}
            </Button>
          </form>
        </section>

        <Button variant="ghost" size="sm" onClick={() => bookingStore.set((s) => ({ ...s, hours: defaultHours() }))}>
          {t("resetHours")}
        </Button>
      </div>
    </div>
  );
}
