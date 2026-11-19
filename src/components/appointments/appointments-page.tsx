"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, Loader2, MessageSquare, Plus, Settings2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyPanel } from "@/components/ui/empty-panel";
import { TemplatePicker } from "@/components/templates/template-picker";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { BackendError, backendUrl } from "@/lib/backend/client";
import {
  APPOINTMENT_VIEWS,
  DAYS,
  addAppointment,
  byDay,
  freeSlots,
  getBookingSettings,
  inView,
  rupees,
  saveBookingSettings,
  updateAppointment,
  useAppointments,
  type Appointment,
  type AppointmentAction,
  type AppointmentStatus,
  type AppointmentView,
  type BookingSettings,
} from "@/lib/appointments";

const STATUS_STYLE: Record<AppointmentStatus, string> = {
  booked: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  completed: "bg-primary/10 text-primary",
  no_show: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  cancelled: "bg-muted text-muted-foreground",
};

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className)}>{children}</span>;
}

export function AppointmentsPage() {
  const t = useTranslations("Appointments");
  const locale = useLocale();
  const { items, loaded, error, reload } = useAppointments();
  const [view, setView] = useState<AppointmentView>("today");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState<BookingSettings | null>(null);

  useEffect(() => {
    if (!backendUrl()) return;
    getBookingSettings()
      .then((loaded) => {
        setSettings(loaded);
        // Back from the Templates page ("Create new template"): reopen the booking settings.
        if (new URLSearchParams(window.location.search).get("settings") === "open") {
          setEditing(true);
          window.history.replaceState(null, "", window.location.pathname);
        }
      })
      .catch(() => {});
  }, []);

  const counts = useMemo(() => Object.fromEntries(APPOINTMENT_VIEWS.map((v) => [v, items.filter((a) => inView(a, v)).length])) as Record<AppointmentView, number>, [items]);
  const shown = items.filter((a) => inView(a, view));
  const groups = byDay(view === "past" ? [...shown].reverse() : shown);
  const open = items.find((a) => a.id === openId) ?? null;
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const noServices = settings !== null && settings.services.length === 0;

  return (
    <div className="space-y-5">
      <h2 className="sr-only">{t("title")}</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11 gap-1.5" onClick={() => setEditing(true)} disabled={!settings}>
            <Settings2 className="size-4" aria-hidden /> {t("settings")}
          </Button>
          <Button className="min-h-11 gap-1.5" onClick={() => setAdding(true)} disabled={!settings || noServices}>
            <Plus className="size-4" aria-hidden /> {t("add")}
          </Button>
        </div>
      </div>

      {noServices && (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t("setupFirst")}{" "}
          <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setEditing(true)}>
            {t("openSettings")}
          </button>
        </div>
      )}

      <div role="tablist" aria-label={t("views")} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {APPOINTMENT_VIEWS.map((v) => (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", view === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted")}
          >
            {t(`view_${v}`)}
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", view === v ? "bg-primary-foreground/20" : "bg-muted")}>{counts[v]}</span>
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]" aria-live="polite">
        {!loaded ? (
          <p role="status" className="p-6 text-sm text-muted-foreground">{t("loading")}</p>
        ) : error ? (
          <p role="alert" className="p-6 text-sm text-destructive">{t("loadError")} <button type="button" className="underline" onClick={() => void reload()}>{t("retry")}</button></p>
        ) : groups.length === 0 ? (
          <EmptyPanel icon={CalendarDays} mascot={items.length ? undefined : "point"} title={items.length ? t("emptyView") : t("emptyTitle")} description={items.length ? undefined : t("emptyHelp")} />
        ) : (
          <div className="divide-y divide-border">
            {groups.map((g) => (
              <div key={g.day}>
                <h3 className="bg-muted/40 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{dayLabel(g.day)}</h3>
                <ul className="divide-y divide-border">
                  {g.items.map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => setOpenId(a.id)} className="flex w-full items-center gap-4 p-4 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                        <span className="w-20 shrink-0 font-semibold tabular-nums text-foreground">{time(a.starts_at)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{a.customer_name || t("noName")}</span>
                          <span className="block truncate text-xs text-muted-foreground">{a.service} · {t("minutes", { n: a.minutes })}{a.source === "ai" ? ` · ${t("byAi")}` : ""}</span>
                        </span>
                        <Chip className={STATUS_STYLE[a.status]}>{t(`status_${a.status}`)}</Chip>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <AppointmentDialog appointment={open} onClose={() => setOpenId(null)} onChanged={() => void reload()} />
      {settings && <AddDialog open={adding} onOpenChange={setAdding} settings={settings} onAdded={() => void reload()} />}
      {settings && <SettingsDialog open={editing} onOpenChange={setEditing} settings={settings} onSaved={setSettings} />}
    </div>
  );
}

function AppointmentDialog({ appointment: a, onClose, onChanged }: { appointment: Appointment | null; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("Appointments");
  const locale = useLocale();
  const [busy, setBusy] = useState<AppointmentAction | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const run = async (action: AppointmentAction) => {
    if (!a) return;
    setBusy(action);
    try {
      const res = await updateAppointment(a.id, action);
      if (action === "cancelled" && !res.notified && res.not_notified_reason) toast.warning(t("cancelledNotTold", { reason: res.not_notified_reason }));
      else toast.success(t(`done_${action}`));
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof BackendError ? e.message : t("failed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={!!a} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {a && (
          <>
            <DialogHeader>
              <DialogTitle>{t("apptTitle", { n: a.number })}</DialogTitle>
              <DialogDescription>{new Date(a.starts_at).toLocaleString(locale, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}</DialogDescription>
            </DialogHeader>
            <dl className="grid gap-3 rounded-xl bg-muted/50 p-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">{t("service")}</dt><dd className="text-foreground">{a.service} · {t("minutes", { n: a.minutes })}{a.price_paise ? ` · ${rupees(a.price_paise)}` : ""}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{t("customer")}</dt><dd className="text-foreground">{a.customer_name || t("noName")}{a.customer_phone && <span className="text-muted-foreground"> · {a.customer_phone}</span>}</dd></div>
              {a.note && <div><dt className="text-xs text-muted-foreground">{t("note")}</dt><dd className="text-foreground">{a.note}</dd></div>}
              <div><dt className="text-xs text-muted-foreground">{t("status")}</dt><dd><Chip className={STATUS_STYLE[a.status]}>{t(`status_${a.status}`)}</Chip> <span className="ml-1 text-xs text-muted-foreground">{a.source === "ai" ? t("byAi") : t("byTeam")}</span></dd></div>
              {a.reminded_at && <div><dt className="text-xs text-muted-foreground">{t("reminder")}</dt><dd className="text-foreground">{a.reminder_error ? t("reminderFailed", { reason: a.reminder_error }) : t("reminderSent")}</dd></div>}
            </dl>
            {a.status === "booked" && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button className="min-h-11" disabled={!!busy} onClick={() => void run("completed")}>{busy === "completed" ? t("working") : t("action_completed")}</Button>
                <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => void run("no_show")}>{t("action_no_show")}</Button>
                <Button variant="ghost" className="min-h-11 text-destructive hover:text-destructive" disabled={!!busy} onClick={() => setConfirmCancel(true)}>{t("action_cancelled")}</Button>
              </div>
            )}
            {a.conversation_id && (
              <Link href={`/inbox?c=${a.conversation_id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                <MessageSquare className="size-4" aria-hidden /> {t("openChat")}
              </Link>
            )}
            <ConfirmDialog open={confirmCancel} onOpenChange={setConfirmCancel} title={t("cancelTitle", { n: a.number })} description={t("cancelHelp")} confirmLabel={t("action_cancelled")} cancelLabel={t("keep")} onConfirm={() => void run("cancelled")} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddDialog({ open, onOpenChange, settings, onAdded }: { open: boolean; onOpenChange: (v: boolean) => void; settings: BookingSettings; onAdded: () => void }) {
  const t = useTranslations("Appointments");
  const [service, setService] = useState(settings.services[0]?.name ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [timeOf, setTimeOf] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !service) return;
    let live = true;
    freeSlots(service, settings.days_ahead).then((s) => live && setSlots(s)).catch(() => live && setSlots([]));
    return () => {
      live = false;
    };
  }, [open, service, settings.days_ahead]);

  const dayFree = (slots ?? []).filter((s) => s.startsWith(date)).map((s) => s.slice(11, 16));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!timeOf || !name.trim()) return;
    setBusy(true);
    try {
      await addAppointment({ service, start: `${date} ${timeOf}`, name: name.trim(), phone, note });
      toast.success(t("added"));
      onAdded();
      onOpenChange(false);
      setName(""); setPhone(""); setNote(""); setTimeOf("");
    } catch (err) {
      toast.error(err instanceof BackendError ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addTitle")}</DialogTitle>
          <DialogDescription>{t("addHelp")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="ap-service">{t("service")}</Label>
            <NativeSelect id="ap-service" value={service} onChange={(e) => { setService(e.target.value); setTimeOf(""); }}>
              {settings.services.map((s) => <option key={s.name} value={s.name}>{s.name} ({t("minutes", { n: s.minutes })})</option>)}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="ap-date">{t("date")}</Label><Input id="ap-date" type="date" className="min-h-11" value={date} onChange={(e) => { setDate(e.target.value); setTimeOf(""); }} required /></div>
            <div className="grid gap-1.5"><Label htmlFor="ap-time">{t("time")}</Label><Input id="ap-time" type="time" className="min-h-11" value={timeOf} onChange={(e) => setTimeOf(e.target.value)} required /></div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{slots === null ? t("loadingSlots") : dayFree.length ? t("freeOnDay") : t("noFreeOnDay")}</p>
            {dayFree.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {dayFree.slice(0, 24).map((s) => (
                  <button key={s} type="button" onClick={() => setTimeOf(s)} aria-pressed={timeOf === s} className={cn("min-h-9 rounded-lg border px-2.5 text-xs tabular-nums", timeOf === s ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>{s}</button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-1.5"><Label htmlFor="ap-name">{t("name")}</Label><Input id="ap-name" className="min-h-11" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="grid gap-1.5"><Label htmlFor="ap-phone">{t("phone")}</Label><Input id="ap-phone" type="tel" inputMode="tel" className="min-h-11" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="ap-note">{t("note")}</Label><Textarea id="ap-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button type="submit" className="min-h-11" disabled={busy || !timeOf || !name.trim()}>{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{t("addSave")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({ open, onOpenChange, settings, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; settings: BookingSettings; onSaved: (s: BookingSettings) => void }) {
  const t = useTranslations("Appointments");
  const [s, setS] = useState<BookingSettings>(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setS(settings); }, [open, settings]);
  const put = (patch: Partial<BookingSettings>) => setS((prev) => ({ ...prev, ...patch }));
  const num = (v: string, fallback: number) => (v === "" ? fallback : Number(v) || 0);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveBookingSettings({ ...s, services: s.services.filter((x) => x.name.trim()) });
      onSaved(saved);
      toast.success(t("settingsSaved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof BackendError ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("settingsTitle")}</DialogTitle>
          <DialogDescription>{t("settingsHelp")}</DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">{t("services")}</legend>
          {s.services.map((svc, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_2.75rem] items-end gap-2">
              <div className="grid gap-1"><Label htmlFor={`svc-n-${i}`} className="text-xs">{t("serviceName")}</Label><Input id={`svc-n-${i}`} className="min-h-11" value={svc.name} maxLength={80} onChange={(e) => put({ services: s.services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></div>
              <div className="grid gap-1"><Label htmlFor={`svc-m-${i}`} className="text-xs">{t("serviceMinutes")}</Label><Input id={`svc-m-${i}`} type="number" min={5} max={480} className="min-h-11" value={svc.minutes} onChange={(e) => put({ services: s.services.map((x, j) => (j === i ? { ...x, minutes: num(e.target.value, 30) } : x)) })} /></div>
              <div className="grid gap-1"><Label htmlFor={`svc-p-${i}`} className="text-xs">{t("servicePrice")}</Label><Input id={`svc-p-${i}`} type="number" min={0} className="min-h-11" value={svc.price || ""} placeholder="0" onChange={(e) => put({ services: s.services.map((x, j) => (j === i ? { ...x, price: num(e.target.value, 0) } : x)) })} /></div>
              <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={t("removeService", { name: svc.name || "" })} onClick={() => put({ services: s.services.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" className="min-h-11 justify-self-start gap-1.5" onClick={() => put({ services: [...s.services, { name: "", minutes: s.slot_minutes, price: 0 }] })}><Plus className="size-4" aria-hidden /> {t("addService")}</Button>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">{t("hours")}</legend>
          {DAYS.map((d) => {
            const win = s.hours[d]?.[0];
            return (
              <div key={d} className="grid grid-cols-[5.5rem_auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                <span className="text-sm text-foreground">{t(`day_${d}`)}</span>
                <Switch checked={!!win} aria-label={t("openOn", { day: t(`day_${d}`) })} onCheckedChange={(on) => put({ hours: { ...s.hours, [d]: on ? [["09:00", "18:00"]] : [] } })} />
                <Input type="time" aria-label={t("opens", { day: t(`day_${d}`) })} className="min-h-11" disabled={!win} value={win?.[0] ?? ""} onChange={(e) => put({ hours: { ...s.hours, [d]: [[e.target.value, win?.[1] ?? "18:00"]] } })} />
                <Input type="time" aria-label={t("closes", { day: t(`day_${d}`) })} className="min-h-11" disabled={!win} value={win?.[1] ?? ""} onChange={(e) => put({ hours: { ...s.hours, [d]: [[win?.[0] ?? "09:00", e.target.value]] } })} />
              </div>
            );
          })}
        </fieldset>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="grid gap-1"><Label htmlFor="bk-slot" className="text-xs">{t("slotMinutes")}</Label><Input id="bk-slot" type="number" min={5} max={240} className="min-h-11" value={s.slot_minutes} onChange={(e) => put({ slot_minutes: num(e.target.value, 30) })} /></div>
          <div className="grid gap-1"><Label htmlFor="bk-per" className="text-xs">{t("perSlot")}</Label><Input id="bk-per" type="number" min={1} max={50} className="min-h-11" value={s.per_slot} onChange={(e) => put({ per_slot: num(e.target.value, 1) })} /></div>
          <div className="grid gap-1"><Label htmlFor="bk-days" className="text-xs">{t("daysAhead")}</Label><Input id="bk-days" type="number" min={1} max={60} className="min-h-11" value={s.days_ahead} onChange={(e) => put({ days_ahead: num(e.target.value, 14) })} /></div>
          <div className="grid gap-1"><Label htmlFor="bk-notice" className="text-xs">{t("notice")}</Label><Input id="bk-notice" type="number" min={0} max={10080} className="min-h-11" value={s.min_notice_minutes} onChange={(e) => put({ min_notice_minutes: num(e.target.value, 60) })} /></div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border px-3"><span className="text-sm text-foreground">{t("reminders")}</span><Switch checked={s.reminders} onCheckedChange={(v) => put({ reminders: v })} /></label>
          <div className="grid gap-1"><Label htmlFor="bk-lang" className="text-xs">{t("language")}</Label>
            <NativeSelect id="bk-lang" value={s.language} onChange={(e) => put({ language: e.target.value as BookingSettings["language"] })}>
              <option value="en">English</option><option value="pt">Português</option><option value="es">Español</option><option value="ko">한국어</option>
            </NativeSelect>
          </div>
        </div>
        {s.reminders && <TemplatePicker kind="reminder" value={s.reminder_template} language={s.language} returnTo="/appointments?settings=open" onChange={(reminder_template) => setS({ ...s, reminder_template })} />}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>{t("close")}</Button>
          <Button className="min-h-11" disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{t("saveSettings")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
