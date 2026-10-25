"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Clock, Pencil, Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { bookingStore, formatPrice, useBookingState, type Service, type Staff } from "@/lib/booking/model";
import { NativeSelect } from "@/components/ui/native-select"

const COLORS = ["#1E4C41", "#7C5CBF", "#C2410C", "#2563EB", "#B45309", "#BE185D"];
const DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240];

export function ServicesPanel() {
  const t = useTranslations("Bookings");
  const state = useBookingState();
  const [editing, setEditing] = useState<Service | "new" | null>(null);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("servicesTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("servicesDesc")}</p>
          </div>
          <Button onClick={() => setEditing("new")} className="gap-1.5">
            <Plus className="size-4" />
            {t("addService")}
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {state.services.map((s) => (
            <div key={s.id} className={cn("rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]", !s.active && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: s.color }} />
                  <h3 className="font-semibold text-foreground">{s.name}</h3>
                </div>
                <Switch
                  checked={s.active}
                  aria-label={t("serviceActive")}
                  onCheckedChange={(active) => bookingStore.set((st) => ({ ...st, services: st.services.map((x) => (x.id === s.id ? { ...x, active } : x)) }))}
                />
              </div>
              <p className="mt-1.5 min-h-10 text-sm text-muted-foreground">{s.description}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground">
                <span className="font-semibold">{s.price ? formatPrice(s.price) : t("free")}</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="size-3.5" />
                  {t("minutes", { count: s.durationMin })}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Users className="size-3.5" />
                  {s.staffIds.map((id) => state.staff.find((st) => st.id === id)?.name).filter(Boolean).join(", ")}
                </span>
              </div>
              <div className="mt-4 flex gap-2 border-t border-border pt-3">
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setEditing(s)}>
                  <Pencil className="size-3.5" />
                  {t("edit")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => {
                    bookingStore.set((st) => ({ ...st, services: st.services.filter((x) => x.id !== s.id) }));
                    toast.success(t("serviceDeleted"));
                  }}
                >
                  <Trash2 className="size-3.5" />
                  {t("delete")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <StaffSection staff={state.staff} />

      {editing && <ServiceDialog service={editing === "new" ? null : editing} staff={state.staff} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StaffSection({ staff }: { staff: Staff[] }) {
  const t = useTranslations("Bookings");
  const [name, setName] = useState("");
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">{t("staffTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("staffDesc")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {staff.map((st) => (
          <span key={st.id} className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-3 pl-1.5 text-sm text-foreground">
            <span className="flex size-6 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: st.color }}>
              {st.name.charAt(0)}
            </span>
            {st.name}
            <span className="text-xs text-muted-foreground">· {st.hours ? t("customHours") : t("businessHours")}</span>
          </span>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            bookingStore.set((s) => ({ ...s, staff: [...s.staff, { id: `st${Date.now()}`, name: name.trim(), color: COLORS[s.staff.length % COLORS.length], hours: null }] }));
            setName("");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("staffNamePh")} className="h-8 w-40" aria-label={t("staffNamePh")} />
          <Button type="submit" size="sm" variant="outline">
            {t("addStaff")}
          </Button>
        </form>
      </div>
    </section>
  );
}

function ServiceDialog({ service, staff, onClose }: { service: Service | null; staff: Staff[]; onClose: () => void }) {
  const t = useTranslations("Bookings");
  const [draft, setDraft] = useState<Service>(
    () => service ?? { id: `sv${Date.now()}`, name: "", durationMin: 30, price: 0, bufferMin: 0, staffIds: staff.map((s) => s.id), color: COLORS[0], active: true, description: "" },
  );
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<Service>) => setDraft((d) => ({ ...d, ...patch }));
  const save = () => {
    setTried(true);
    if (!draft.name.trim() || draft.staffIds.length === 0) return;
    bookingStore.set((s) => ({ ...s, services: service ? s.services.map((x) => (x.id === service.id ? draft : x)) : [...s.services, draft] }));
    toast.success(service ? t("serviceSaved") : t("serviceAdded"));
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{service ? t("editService") : t("addService")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="sv-name">{t("serviceName")}</Label>
            <Input id="sv-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} aria-invalid={tried && !draft.name.trim()} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sv-desc">{t("serviceDescription")}</Label>
            <Textarea id="sv-desc" rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder={t("serviceDescriptionPh")} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sv-duration">{t("duration")}</Label>
              <NativeSelect id="sv-duration"  value={draft.durationMin} onChange={(e) => set({ durationMin: Number(e.target.value) })}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {t("minutes", { count: d })}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sv-price">{t("price")}</Label>
              <Input id="sv-price" type="number" min={0} value={draft.price} onChange={(e) => set({ price: Number(e.target.value) })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sv-buffer">{t("buffer")}</Label>
              <Input id="sv-buffer" type="number" min={0} step={5} value={draft.bufferMin} onChange={(e) => set({ bufferMin: Number(e.target.value) })} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("bufferHint")}</p>
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{t("whoCanDoIt")}</p>
            <div className="flex flex-wrap gap-2">
              {staff.map((st) => {
                const on = draft.staffIds.includes(st.id);
                return (
                  <button
                    key={st.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ staffIds: on ? draft.staffIds.filter((x) => x !== st.id) : [...draft.staffIds, st.id] })}
                    className={cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}
                  >
                    {st.name}
                  </button>
                );
              })}
            </div>
            {tried && draft.staffIds.length === 0 && <p className="mt-1.5 text-xs text-destructive">{t("pickStaff")}</p>}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{t("colour")}</p>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={draft.color === c}
                  onClick={() => set({ color: c })}
                  className={cn("size-7 rounded-full ring-offset-2 ring-offset-card", draft.color === c && "ring-2 ring-foreground")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={save}>{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
