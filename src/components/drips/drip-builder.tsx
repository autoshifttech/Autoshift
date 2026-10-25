"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Clock, Flag, Pause, Play, Plus, Rocket, Trash2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { Bubble, QuickButtons, WhatsAppPreview } from "@/components/booking/whatsapp-preview";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/wallet/model";
import { AUDIENCE, TAGS, members, useSegments } from "@/lib/segments/model";
import {
  CONDITIONS,
  DRIP_TEMPLATES,
  TRIGGERS,
  costPerContact,
  dripsStore,
  priceOf,
  renderTemplate,
  totalDuration,
  updateDrip,
  useDrips,
  type DelayUnit,
  type Drip,
  type DripStep,
  type StepCondition,
  type TriggerKind,
} from "@/lib/drips/model";
import { DripStatusChip } from "./drip-ui";

const TRIGGER_DEFAULT: Record<TriggerKind, string> = { segment: "sg-hot", new_lead: "hot", tag_added: TAGS[0], after_booking: "completed", manual: "" };

export function DripBuilder({ id }: { id: string }) {
  const t = useTranslations("Drips");
  const locale = useLocale();
  const router = useRouter();
  const drips = useDrips();
  const segments = useSegments();
  const d = drips.find((x) => x.id === id);
  const [previewStep, setPreviewStep] = useState(0);
  const [tried, setTried] = useState(false);

  if (!d) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <p className="text-sm text-muted-foreground">{t("notFound")}</p>
        <Link href="/drips" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          {t("backToList")}
        </Link>
      </div>
    );
  }

  const set = (patch: Partial<Drip>) => updateDrip(d.id, patch);
  const setStep = (sid: string, patch: Partial<DripStep>) => set({ steps: d.steps.map((s) => (s.id === sid ? { ...s, ...patch } : s)) });
  const audience = d.trigger.kind === "segment" ? members(segments.find((s) => s.id === d.trigger.value) ?? { match: "all", rules: [] }, AUDIENCE).filter((c) => c.optedIn).length : null;
  const minutes = totalDuration(d.steps);
  const shown = d.steps[Math.min(previewStep, d.steps.length - 1)];
  const tpl = DRIP_TEMPLATES.find((x) => x.name === shown?.template);

  const activate = () => {
    setTried(true);
    if (!d.name.trim()) {
      toast.error(t("nameNeeded"));
      return;
    }
    set({ status: "active" });
    toast.success(t("activatedToast"));
  };

  return (
    <div className="space-y-5">
      <Link href="/drips" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("backToList")}
      </Link>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <Input
            value={d.name}
            placeholder={t("namePh")}
            aria-label={t("name")}
            aria-invalid={tried && !d.name.trim()}
            onChange={(e) => set({ name: e.target.value })}
            className="h-10 border-transparent bg-transparent px-0 text-xl font-bold md:text-xl shadow-none focus-visible:border-input focus-visible:px-3 dark:bg-transparent"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <DripStatusChip status={d.status} />
            <span>{t("stepsCount", { count: d.steps.length })}</span>
            <span>·</span>
            <span>{t("duration", { days: Math.max(0, Math.round((minutes / 1440) * 10) / 10) })}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={() => {
              dripsStore.set((s) => ({ drips: s.drips.filter((x) => x.id !== d.id) }));
              toast.success(t("deleted"));
              router.push("/drips");
            }}
          >
            <Trash2 className="size-4" />
            {t("delete")}
          </Button>
          {d.status === "active" ? (
            <Button variant="outline" className="gap-1.5" onClick={() => set({ status: "paused" })}>
              <Pause className="size-4" />
              {t("pause")}
            </Button>
          ) : (
            <Button className="gap-1.5" onClick={activate}>
              {d.status === "draft" ? <Rocket className="size-4" /> : <Play className="size-4" />}
              {d.status === "draft" ? t("activate") : t("resume")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-0">
          {/* Trigger */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
              <Zap className="size-3.5" />
              {t("entersWhen")}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <NativeSelect value={d.trigger.kind} aria-label={t("trigger")} onChange={(e) => set({ trigger: { kind: e.target.value as TriggerKind, value: TRIGGER_DEFAULT[e.target.value as TriggerKind] } })}>
                {TRIGGERS.map((k) => (
                  <option key={k} value={k}>
                    {t(`trigger_${k}`)}
                  </option>
                ))}
              </NativeSelect>
              {d.trigger.kind === "segment" && (
                <NativeSelect value={d.trigger.value} aria-label={t("segment")} onChange={(e) => set({ trigger: { ...d.trigger, value: e.target.value } })}>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
              {d.trigger.kind === "new_lead" && (
                <NativeSelect value={d.trigger.value} aria-label={t("temperature")} onChange={(e) => set({ trigger: { ...d.trigger, value: e.target.value } })}>
                  {["hot", "warm", "cold"].map((x) => (
                    <option key={x} value={x}>
                      {t(`temp_${x}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
              {d.trigger.kind === "tag_added" && (
                <NativeSelect value={d.trigger.value} aria-label={t("tag")} onChange={(e) => set({ trigger: { ...d.trigger, value: e.target.value } })}>
                  {TAGS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </NativeSelect>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {audience !== null ? t("audienceNow", { count: audience }) : t(`triggerHint_${d.trigger.kind}`)}
            </p>
          </section>

          {d.steps.map((s, i) => {
            const template = DRIP_TEMPLATES.find((x) => x.name === s.template);
            return (
              <div key={s.id}>
                <div className="flex items-center gap-3 py-2 pl-6">
                  <span className="h-8 w-px bg-border" />
                  <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground">
                    <Clock className="size-3.5 text-muted-foreground" />
                    {t("wait")}
                    <Input
                      type="number"
                      min={0}
                      value={s.delay}
                      aria-label={t("waitAmount")}
                      onChange={(e) => setStep(s.id, { delay: Math.max(0, Number(e.target.value)) })}
                      className="h-6 w-14 rounded-md px-1.5 text-center text-xs"
                    />
                    <NativeSelect size="sm" className="h-6 w-24 text-xs" value={s.unit} aria-label={t("waitUnit")} onChange={(e) => setStep(s.id, { unit: e.target.value as DelayUnit })}>
                      <option value="minutes">{t("unit_minutes")}</option>
                      <option value="hours">{t("unit_hours")}</option>
                      <option value="days">{t("unit_days")}</option>
                    </NativeSelect>
                  </span>
                </div>
                <section
                  onClick={() => setPreviewStep(i)}
                  className={cn("rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)] transition-colors", previewStep === i ? "border-primary/60" : "border-border")}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-sm">
                        <span className="text-xs text-muted-foreground">{t("template")}</span>
                        <NativeSelect value={s.template} onChange={(e) => setStep(s.id, { template: e.target.value })}>
                          {DRIP_TEMPLATES.map((x) => (
                            <option key={x.name} value={x.name}>
                              {x.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </label>
                      <label className="grid gap-1.5 text-sm">
                        <span className="text-xs text-muted-foreground">{t("sendIf")}</span>
                        <NativeSelect value={s.condition} onChange={(e) => setStep(s.id, { condition: e.target.value as StepCondition })}>
                          {CONDITIONS.map((c) => (
                            <option key={c} value={c}>
                              {t(`cond_${c}`)}
                            </option>
                          ))}
                        </NativeSelect>
                      </label>
                      <p className="line-clamp-2 text-sm text-muted-foreground sm:col-span-2">{template ? renderTemplate(template.body, "Priya") : ""}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:col-span-2">
                        <span className="rounded-full bg-muted px-2 py-0.5">{t(`cat_${template?.category ?? "marketing"}`)} · {formatMoney(priceOf(s.template), locale)}</span>
                        {s.stats.sent > 0 && (
                          <span>
                            {t("stepStats", { sent: s.stats.sent, read: Math.round((s.stats.read / s.stats.sent) * 100), replied: Math.round((s.stats.replied / s.stats.sent) * 100) })}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("removeStep")}
                      disabled={d.steps.length === 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        set({ steps: d.steps.filter((x) => x.id !== s.id) });
                        setPreviewStep(0);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </section>
              </div>
            );
          })}

          <div className="flex items-center gap-3 py-2 pl-6">
            <span className="h-8 w-px bg-border" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                set({ steps: [...d.steps, { id: `s${Date.now()}`, delay: 2, unit: "days", template: DRIP_TEMPLATES[1].name, condition: "not_replied", stats: { sent: 0, read: 0, replied: 0 } }] });
                setPreviewStep(d.steps.length);
              }}
            >
              <Plus className="size-4" />
              {t("addStep")}
            </Button>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Flag className="size-4" />
              {t("exits")}
            </span>
          </div>

          {/* Settings */}
          <section className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-semibold text-foreground">{t("settings")}</h2>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={d.stopOnReply} onCheckedChange={(stopOnReply) => set({ stopOnReply })} />
              {t("stopOnReply")}
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={d.stopOnBooking} onCheckedChange={(stopOnBooking) => set({ stopOnBooking })} />
              {t("stopOnBooking")}
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={d.skipWeekends} onCheckedChange={(skipWeekends) => set({ skipWeekends })} />
              {t("skipWeekends")}
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{t("sendBetween")}</span>
              <input type="time" value={d.window.start} aria-label={t("windowStart")} onChange={(e) => set({ window: { ...d.window, start: e.target.value } })} className="h-8 w-32 rounded-lg border border-input bg-card px-2 text-sm dark:bg-input/30" />
              <span>–</span>
              <input type="time" value={d.window.end} aria-label={t("windowEnd")} onChange={(e) => set({ window: { ...d.window, end: e.target.value } })} className="h-8 w-32 rounded-lg border border-input bg-card px-2 text-sm dark:bg-input/30" />
            </div>
            <p className="text-xs text-muted-foreground">{t("optInNote")}</p>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <p className="text-sm font-semibold text-foreground">{t("summary")}</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("costEach")}</dt>
                <dd className="font-semibold text-foreground">{formatMoney(costPerContact(d), locale)}</dd>
              </div>
              {audience !== null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("costAll", { count: audience })}</dt>
                  <dd className="font-semibold text-foreground">{formatMoney(costPerContact(d) * audience, locale)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("colEnrolled")}</dt>
                <dd className="font-semibold text-foreground">{d.stats.enrolled}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("colBooked")}</dt>
                <dd className="font-semibold text-foreground">{d.stats.booked}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">{t("costNote")}</p>
          </section>
          {shown && tpl && (
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">{t("previewStep", { n: Math.min(previewStep, d.steps.length - 1) + 1 })}</p>
              <WhatsAppPreview title="Olive & Thread">
                <Bubble from="business" time="10:00">
                  {renderTemplate(tpl.body, "Priya")}
                </Bubble>
                {tpl.buttons.length > 0 && <QuickButtons labels={tpl.buttons} />}
              </WhatsAppPreview>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
