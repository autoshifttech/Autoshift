"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bot, CalendarClock, ChevronLeft, ChevronRight, MessageSquare, Phone, StickyNote, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  addDays,
  bookingEnd,
  bookingStore,
  formatPrice,
  isoDate,
  startOfWeek,
  toMinutes,
  useBookingState,
  type Booking,
  type BookingState,
  type BookingStatus,
} from "@/lib/booking/model";
import { BookingDialog } from "./booking-dialog";
import { StatusChip, useDateLabel } from "./booking-ui";

type View = "day" | "week" | "list";
const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const HOUR_PX = 56;

export function CalendarView() {
  const t = useTranslations("Bookings");
  const state = useBookingState();
  const label = useDateLabel();
  const today = isoDate(new Date());
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(today);
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [reschedule, setReschedule] = useState<Booking | null>(null);

  const bookings = state.bookings.filter((b) => staffFilter === "all" || b.staffId === staffFilter);
  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)) : [anchor];
  const step = view === "week" ? 7 : 1;
  const open = state.bookings.find((b) => b.id === openId) ?? null;

  const todayStats = useMemo(() => {
    const list = state.bookings.filter((b) => b.date === today && b.status !== "cancelled");
    const revenue = list.reduce((sum, b) => sum + (state.services.find((s) => s.id === b.serviceId)?.price ?? 0), 0);
    return { count: list.length, pending: list.filter((b) => b.status === "pending").length, ai: list.filter((b) => b.source === "ai").length, revenue };
  }, [state, today]);

  const rangeLabel =
    view === "week"
      ? `${label(days[0], { day: "numeric", month: "short" })} – ${label(days[6], { day: "numeric", month: "short", year: "numeric" })}`
      : label(anchor, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [t("statToday"), todayStats.count],
          [t("statPending"), todayStats.pending],
          [t("statByAi"), todayStats.ai],
          [t("statRevenue"), formatPrice(todayStats.revenue)],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{v}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" aria-label={t("previous")} onClick={() => setAnchor(addDays(anchor, -step))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>
            {t("today")}
          </Button>
          <Button variant="outline" size="icon-sm" aria-label={t("next")} onClick={() => setAnchor(addDays(anchor, step))}>
            <ChevronRight className="size-4" />
          </Button>
          <span className="ml-1 text-sm font-semibold text-foreground">{view === "list" ? t("upcoming") : rangeLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {[{ id: "all", name: t("allStaff"), color: "" }, ...state.staff].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStaffFilter(st.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  staffFilter === st.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {st.color && <span className="size-2 rounded-full" style={{ background: st.color }} />}
                {st.name}
              </button>
            ))}
          </div>
          <div role="tablist" className="inline-flex rounded-full bg-muted p-1 text-xs">
            {(["day", "week", "list"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                type="button"
                onClick={() => setView(v)}
                className={cn("rounded-full px-3 py-1 font-medium", view === v ? "bg-card text-foreground shadow-[var(--shadow-card)]" : "text-muted-foreground")}
              >
                {t(`view_${v}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "list" ? (
        <ListView state={state} bookings={bookings} onOpen={setOpenId} />
      ) : (
        <TimeGrid state={state} days={days} bookings={bookings} today={today} onOpen={setOpenId} staffColumns={view === "day"} staffFilter={staffFilter} />
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {open && (
            <BookingDetail
              booking={open}
              state={state}
              onReschedule={() => {
                setReschedule(open);
                setOpenId(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      {reschedule && <BookingDialog open booking={reschedule} onOpenChange={(o) => !o && setReschedule(null)} />}
    </div>
  );
}

function TimeGrid({
  state,
  days,
  bookings,
  today,
  onOpen,
  staffColumns,
  staffFilter,
}: {
  state: BookingState;
  days: string[];
  bookings: Booking[];
  today: string;
  onOpen: (id: string) => void;
  staffColumns: boolean;
  staffFilter: string;
}) {
  const label = useDateLabel();
  const t = useTranslations("Bookings");
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START / 60 + i);
  // Day view: one column per staff member. Week view: one per day.
  const columns = staffColumns
    ? state.staff.filter((s) => staffFilter === "all" || s.id === staffFilter).map((s) => ({ key: s.id, title: s.name, date: days[0], staffId: s.id }))
    : days.map((d) => ({ key: d, title: label(d), date: d, staffId: null as string | null }));
  const holiday = (d: string) => state.holidays.find((h) => h.date === d);

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="min-w-[760px]">
        <div className="grid border-b border-border" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))` }}>
          <div />
          {columns.map((c) => (
            <div key={c.key} className={cn("border-l border-border px-2 py-2.5 text-center text-xs font-semibold", c.date === today && !staffColumns ? "text-primary" : "text-foreground")}>
              {c.title}
              {!staffColumns && holiday(c.date) && <span className="mt-0.5 block font-normal text-amber-700 dark:text-amber-300">{holiday(c.date)!.label}</span>}
            </div>
          ))}
        </div>
        <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))` }}>
          <div>
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_PX }} className="pr-2 text-right text-xs text-muted-foreground">
                <span className="relative -top-2">{`${String(h).padStart(2, "0")}:00`}</span>
              </div>
            ))}
          </div>
          {columns.map((c) => {
            const items = bookings.filter((b) => b.date === c.date && (!c.staffId || b.staffId === c.staffId));
            const lanes = assignLanes(items, state);
            return (
              <div
                key={c.key}
                className={cn("relative border-l border-border", holiday(c.date) && "bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,var(--muted)_6px,var(--muted)_8px)]")}
              >
                {hours.map((h) => (
                  <div key={h} style={{ height: HOUR_PX }} className="border-b border-dashed border-border/70" />
                ))}
                {items.map((b) => {
                  const service = state.services.find((s) => s.id === b.serviceId);
                  const staff = state.staff.find((s) => s.id === b.staffId);
                  const top = ((toMinutes(b.start) - DAY_START) / 60) * HOUR_PX;
                  const height = Math.max(26, ((service?.durationMin ?? 30) / 60) * HOUR_PX - 3);
                  const muted = b.status === "cancelled" || b.status === "no_show";
                  const { lane, of } = lanes.get(b.id) ?? { lane: 0, of: 1 };
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onOpen(b.id)}
                      style={{ top, height, left: `calc(${(lane / of) * 100}% + 3px)`, width: `calc(${100 / of}% - 6px)`, borderLeftColor: staff?.color ?? service?.color }}
                      className={cn(
                        "absolute overflow-hidden rounded-lg border-l-4 bg-[var(--tone-mint)] px-2 py-1 text-left text-xs leading-tight shadow-sm transition hover:brightness-95",
                        b.status === "pending" && "bg-[var(--tone-butter)]",
                        muted && "bg-muted opacity-80",
                      )}
                    >
                      <span className={cn("block truncate font-semibold text-foreground", b.status === "cancelled" && "line-through")}>{b.contactName}</span>
                      <span className="block truncate text-muted-foreground">
                        {b.start} · {service?.name}
                      </span>
                      {b.source === "ai" && height > 44 && (
                        <span className="mt-0.5 inline-flex items-center gap-0.5 text-primary">
                          <Bot className="size-3" /> {t("byAi")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Side-by-side lanes for overlapping bookings in one column (greedy, per overlap cluster). */
function assignLanes(items: Booking[], state: BookingState): Map<string, { lane: number; of: number }> {
  const span = (b: Booking) => {
    const start = toMinutes(b.start);
    return { start, end: start + (state.services.find((s) => s.id === b.serviceId)?.durationMin ?? 30) };
  };
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));
  const out = new Map<string, { lane: number; of: number }>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => cluster.forEach(({ id, lane }) => out.set(id, { lane, of: laneEnds.length }));
  for (const b of sorted) {
    const { start, end } = span(b);
    if (start >= clusterEnd) {
      flush();
      cluster = [];
      laneEnds = [];
    }
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) lane = laneEnds.push(end) - 1;
    else laneEnds[lane] = end;
    cluster.push({ id: b.id, lane });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return out;
}

function ListView({ state, bookings, onOpen }: { state: BookingState; bookings: Booking[]; onOpen: (id: string) => void }) {
  const t = useTranslations("Bookings");
  const label = useDateLabel();
  const today = isoDate(new Date());
  const upcoming = [...bookings].filter((b) => b.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const groups = upcoming.reduce<Record<string, Booking[]>>((acc, b) => ((acc[b.date] ??= []).push(b), acc), {});
  if (!upcoming.length) return <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t("emptyUpcoming")}</p>;
  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([date, list]) => (
        <section key={date}>
          <h3 className="mb-2 text-sm font-semibold text-foreground">{date === today ? t("today") : label(date, { weekday: "long", day: "numeric", month: "long" })}</h3>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {list.map((b, i) => {
              const service = state.services.find((s) => s.id === b.serviceId);
              const staff = state.staff.find((s) => s.id === b.staffId);
              return (
                <button key={b.id} type="button" onClick={() => onOpen(b.id)} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50", i > 0 && "border-t border-border")}>
                  <span className="w-12 shrink-0 font-semibold text-foreground">{b.start}</span>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: staff?.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{b.contactName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {service?.name} · {staff?.name}
                    </span>
                  </span>
                  {b.source === "ai" && <Bot className="size-4 shrink-0 text-primary" aria-label={t("byAi")} />}
                  <StatusChip status={b.status} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function BookingDetail({ booking, state, onReschedule }: { booking: Booking; state: BookingState; onReschedule: () => void }) {
  const t = useTranslations("Bookings");
  const label = useDateLabel();
  const service = state.services.find((s) => s.id === booking.serviceId);
  const staff = state.staff.find((s) => s.id === booking.staffId);
  const setStatus = (status: BookingStatus) => {
    bookingStore.set((s) => ({ ...s, bookings: s.bookings.map((b) => (b.id === booking.id ? { ...b, status } : b)) }));
    toast.success(t(`statusToast_${status}`));
  };
  const rows = [
    { icon: CalendarClock, text: `${label(booking.date, { weekday: "long", day: "numeric", month: "long" })} · ${booking.start}–${bookingEnd(booking, service)}` },
    { icon: UserRound, text: `${t("withStaff", { name: staff?.name ?? "" })}` },
    { icon: Phone, text: booking.phone },
    ...(booking.notes ? [{ icon: StickyNote, text: booking.notes }] : []),
  ];
  const active = booking.status === "confirmed" || booking.status === "pending";
  return (
    <>
      <SheetHeader>
        <StatusChip status={booking.status} />
        <SheetTitle className="text-lg">{booking.contactName}</SheetTitle>
        <SheetDescription>
          {service?.name} · {service ? formatPrice(service.price) : ""} · {t("minutes", { count: service?.durationMin ?? 0 })}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4 pb-6">
        <ul className="space-y-3 text-sm">
          {rows.map(({ icon: Icon, text }) => (
            <li key={text} className="flex gap-3 text-foreground">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {text}
            </li>
          ))}
        </ul>
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          {t(`source_${booking.source}`)} · {t("confirmationSent")}
        </p>
        <div className="grid gap-2">
          {booking.status === "pending" && <Button onClick={() => setStatus("confirmed")}>{t("confirm")}</Button>}
          {active && (
            <>
              <Button variant="outline" onClick={onReschedule}>
                {t("reschedule")}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setStatus("completed")}>
                  {t("markCompleted")}
                </Button>
                <Button variant="outline" onClick={() => setStatus("no_show")}>
                  {t("markNoShow")}
                </Button>
              </div>
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setStatus("cancelled")}>
                {t("cancelBooking")}
              </Button>
            </>
          )}
          <Link href="/inbox" className="inline-flex items-center justify-center gap-1.5 rounded-full py-2 text-sm font-medium text-primary hover:underline">
            <MessageSquare className="size-4" />
            {t("openChat")}
          </Link>
        </div>
      </div>
    </>
  );
}
