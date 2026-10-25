"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSetup } from "@/lib/workspace/setup";
import { DEFAULT_CONFIRMATION, addDays, bookingStore, isoDate, renderConfirmation, useBookingState, type BookingRules } from "@/lib/booking/model";
import { selectClass, useDateLabel } from "./booking-ui";
import { Bubble, QuickButtons, WhatsAppPreview } from "./whatsapp-preview";
import { NativeSelect } from "@/components/ui/native-select"

const VARIABLES = ["name", "service", "staff", "date", "time", "business"];

export function BookingSettingsPanel() {
  const t = useTranslations("Bookings");
  const state = useBookingState();
  const setup = useSetup();
  const label = useDateLabel();
  const { rules } = state;
  const set = (patch: Partial<BookingRules>) => bookingStore.set((s) => ({ ...s, rules: { ...s.rules, ...patch } }));
  const business = setup.business.displayName || setup.business.name || "AutoShift";
  const service = state.services.find((s) => s.active);
  const tomorrow = addDays(isoDate(new Date()), 1);

  const number = (key: keyof BookingRules, labelText: string, hint: string, options: number[], unit: (n: number) => string) => (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={`rule-${key}`}>{labelText}</Label>
      <NativeSelect id={`rule-${key}`} className={selectClass} value={rules[key] as number} onChange={(e) => set({ [key]: Number(e.target.value) })}>
        {options.map((n) => (
          <option key={n} value={n}>
            {unit(n)}
          </option>
        ))}
      </NativeSelect>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-8">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold text-foreground">{t("rulesTitle")}</h2>
          <p className="mb-5 text-sm text-muted-foreground">{t("rulesDesc")}</p>
          <div className="grid gap-5 sm:grid-cols-2">
            {number("minNoticeHours", t("minNotice"), t("minNoticeHint"), [0, 1, 2, 4, 12, 24, 48], (n) => t("hours", { count: n }))}
            {number("maxAdvanceDays", t("maxAdvance"), t("maxAdvanceHint"), [7, 14, 30, 60, 90], (n) => t("days", { count: n }))}
            {number("slotStepMin", t("slotStep"), t("slotStepHint"), [10, 15, 20, 30, 60], (n) => t("minutes", { count: n }))}
            {number("perSlot", t("perSlot"), t("perSlotHint"), [1, 2, 3, 4, 6, 8], (n) => String(n))}
          </div>
          <label className="mt-5 flex items-start gap-3 text-sm">
            <Switch checked={rules.allowCustomerCancel} onCheckedChange={(v) => set({ allowCustomerCancel: v })} />
            <span>
              <span className="font-medium text-foreground">{t("allowCancel")}</span>
              <span className="block text-muted-foreground">{t("allowCancelHint")}</span>
            </span>
          </label>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold text-foreground">{t("confirmationTitle")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("confirmationDesc")}</p>
          <Textarea rows={5} value={rules.confirmationMessage} onChange={(e) => set({ confirmationMessage: e.target.value })} aria-label={t("confirmationTitle")} />
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t("insert")}</span>
            {VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set({ confirmationMessage: `${rules.confirmationMessage} {{${v}}}` })}
                className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-foreground hover:bg-muted"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => toast.success(t("settingsSaved"))}>
              {t("save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => set({ confirmationMessage: DEFAULT_CONFIRMATION })}>
              {t("resetDefault")}
            </Button>
          </div>
          <p className="mt-4 rounded-xl bg-[var(--tone-sky)] p-3 text-xs text-foreground">{t("templateNote")}</p>
        </section>
      </div>

      <aside className="space-y-3">
        <p className="text-sm font-medium text-foreground">{t("aiFlowTitle")}</p>
        <WhatsAppPreview title={business}>
          <Bubble from="customer" time="10:02">
            {t("chatAsk", { service: service?.name ?? "" })}
          </Bubble>
          <Bubble from="business" time="10:02">
            {t("chatOffer", { date: label(tomorrow, { weekday: "long", day: "numeric", month: "short" }) })}
          </Bubble>
          <QuickButtons labels={["11:00", "14:30", "16:00"]} />
          <Bubble from="customer" time="10:03">
            14:30
          </Bubble>
          <Bubble from="business" time="10:03">
            {renderConfirmation(rules.confirmationMessage, {
              name: "Priya",
              service: service?.name ?? "",
              staff: state.staff[0]?.name ?? "",
              date: label(tomorrow, { weekday: "long", day: "numeric", month: "long" }),
              time: "14:30",
              business,
            })}
          </Bubble>
        </WhatsAppPreview>
        <p className="text-xs text-muted-foreground">{t("aiFlowNote")}</p>
      </aside>
    </div>
  );
}
