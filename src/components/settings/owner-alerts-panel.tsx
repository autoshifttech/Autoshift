"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bell, Lock, Mail, MessageCircle, Plus, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CHANNELS, EVENT_GROUPS, REQUIRED, canTurnOff, notifyStore, useNotifyPrefs, type Channel, type NotifyEvent, type NotifyPrefs } from "@/lib/notify/model";
import { SettingsPanelHead } from "./settings-panel-head";

const CHANNEL_ICON = { email: Mail, whatsapp: MessageCircle, app: Bell } as const;

export function OwnerAlertsPanel() {
  const saved = useNotifyPrefs();
  return <Form key={JSON.stringify(saved)} saved={saved} />;
}

function Form({ saved }: { saved: NotifyPrefs }) {
  const t = useTranslations("OwnerAlerts");
  const [p, setP] = useState(saved);
  const [email, setEmail] = useState("");
  const dirty = JSON.stringify(p) !== JSON.stringify(saved);
  const usesWhatsapp = Object.values(p.matrix).some((m) => m.whatsapp);
  const waDigits = p.whatsapp.replace(/\D/g, "").length;
  // Empty is fine (WhatsApp alerts just wait for a number); half a number isn't.
  const waOk = waDigits === 0 || waDigits >= 10;
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  const toggle = (e: NotifyEvent, c: Channel, v: boolean) => {
    if (!v && !canTurnOff(p, e, c)) {
      toast.error(t("requiredToast"));
      return;
    }
    setP({ ...p, matrix: { ...p.matrix, [e]: { ...p.matrix[e], [c]: v } } });
  };

  return (
    <section className="space-y-6">
      <SettingsPanelHead
        title={t("title")}
        description={t("description")}
        action={
          <Button
            disabled={!dirty || !waOk || p.emails.length === 0}
            onClick={() => {
              notifyStore.set(p);
              toast.success(t("saved"));
            }}
          >
            {t("save")}
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Mail className="size-4 text-primary" />
            {t("emailTo")}
          </h3>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {p.emails.map((e) => (
              <li key={e} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground">
                {e}
                {p.emails.length > 1 && (
                  <button type="button" aria-label={t("removeEmail", { email: e })} onClick={() => setP({ ...p, emails: p.emails.filter((x) => x !== e) })} className="text-muted-foreground hover:text-foreground">
                    <X className="size-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!emailOk || p.emails.includes(email.trim().toLowerCase())) return;
              setP({ ...p, emails: [...p.emails, email.trim().toLowerCase()] });
              setEmail("");
            }}
          >
            <Input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder={t("addEmailPlaceholder")} aria-label={t("addEmailPlaceholder")} className="h-9" />
            <Button type="submit" variant="outline" size="sm" className="gap-1" disabled={!emailOk}>
              <Plus className="size-3.5" />
              {t("add")}
            </Button>
          </form>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <MessageCircle className="size-4 text-primary" />
            {t("whatsappTo")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("whatsappHint")}</p>
          <Input className={cn("mt-3 h-9", !waOk && "border-rose-500")} inputMode="tel" placeholder="+91 98765 43210" value={p.whatsapp} onChange={(ev) => setP({ ...p, whatsapp: ev.target.value })} aria-label={t("whatsappTo")} />
          {!waOk && <p className="mt-1 text-xs text-rose-600">{t("whatsappInvalid")}</p>}
          {waOk && waDigits === 0 && usesWhatsapp && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t("whatsappNeeded")}</p>}
          <label className="mt-4 flex items-center justify-between gap-3 text-sm text-foreground">
            <span>
              {t("quietHours")}
              <span className="block text-xs text-muted-foreground">{t("quietHoursHint")}</span>
            </span>
            <Switch checked={p.quietHours.enabled} onCheckedChange={(v) => setP({ ...p, quietHours: { ...p.quietHours, enabled: v } })} aria-label={t("quietHours")} />
          </label>
          {p.quietHours.enabled && (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Input type="time" value={p.quietHours.from} onChange={(ev) => setP({ ...p, quietHours: { ...p.quietHours, from: ev.target.value } })} aria-label={t("from")} className="h-9 w-28" />
              {t("to")}
              <Input type="time" value={p.quietHours.to} onChange={(ev) => setP({ ...p, quietHours: { ...p.quietHours, to: ev.target.value } })} aria-label={t("to")} className="h-9 w-28" />
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">{t("event")}</th>
                {CHANNELS.map((c) => {
                  const Icon = CHANNEL_ICON[c];
                  return (
                    <th key={c} className="w-24 px-3 py-3 text-center font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Icon className="size-3.5" />
                        {t(`channel_${c}`)}
                      </span>
                    </th>
                  );
                })}
                <th className="w-20 px-3 py-3" />
              </tr>
            </thead>
            {(Object.keys(EVENT_GROUPS) as (keyof typeof EVENT_GROUPS)[]).map((g) => (
              <tbody key={g} className="divide-y divide-border border-b border-border last:border-b-0">
                <tr>
                  <td colSpan={5} className="bg-muted/40 px-5 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {t(`group_${g}`)}
                  </td>
                </tr>
                {EVENT_GROUPS[g].map((e) => (
                  <tr key={e}>
                    <td className="px-5 py-3">
                      <p className="flex items-center gap-1.5 font-medium text-foreground">
                        {t(`event_${e}`)}
                        {REQUIRED.includes(e) && <Lock className="size-3 text-muted-foreground" aria-label={t("required")} />}
                      </p>
                      <p className="text-xs text-muted-foreground">{e === "dailySummary" ? t("event_dailySummary_desc", { time: p.summaryTime }) : t(`event_${e}_desc`)}</p>
                    </td>
                    {CHANNELS.map((c) => (
                      <td key={c} className="px-3 py-3 text-center">
                        <Switch checked={p.matrix[e][c]} onCheckedChange={(v) => toggle(e, c, v)} aria-label={`${t(`event_${e}`)}: ${t(`channel_${c}`)}`} />
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right">
                      <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => toast.success(t("testSent", { event: t(`event_${e}`) }))}>
                        <Send className="size-3" />
                        {t("test")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <Label htmlFor="summary-time" className="flex-1 text-sm">
          {t("summaryTime")}
        </Label>
        <Input id="summary-time" type="time" value={p.summaryTime} onChange={(ev) => setP({ ...p, summaryTime: ev.target.value })} className="h-9 w-28" />
      </div>
      <p className="text-xs text-muted-foreground">{t("footnote")}</p>
    </section>
  );
}
