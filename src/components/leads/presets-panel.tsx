"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, MessageCircleQuestion, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { INDUSTRIES, type Industry } from "@/lib/workspace/setup";
import { PRESETS, applyPreset, leadStore, useLeadSettings, type AiProfile } from "@/lib/leads/model";

/** AI Agents → Business presets: pick a business type, preview, apply; then tune tone, FAQs and fallback. */
export function PresetsPanel() {
  const t = useTranslations("Leads");
  const to = useTranslations("Onboarding");
  const s = useLeadSettings();
  const [pick, setPick] = useState<Industry>(s.industry);
  const preset = PRESETS[pick];
  const ai = s.ai;
  const setAi = (patch: Partial<AiProfile>) => leadStore.set((x) => ({ ...x, ai: { ...x.ai, ...patch } }));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-foreground">{t("presetsTitle")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t("presetsDesc")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {INDUSTRIES.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={pick === id}
              onClick={() => setPick(id)}
              className={cn(
                "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                pick === id ? "border-primary bg-primary/5 font-medium text-primary" : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              {to(`industry_${id}`)}
              {s.industry === id && <Check className="size-4 text-primary" aria-label={t("inUse")} />}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("presetQuestions")}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-foreground">
              {preset.questions.map((q) => (
                <li key={q.id}>{q.prompt}</li>
              ))}
            </ol>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("presetFaqs")}</p>
            <ul className="mt-2 space-y-2 text-sm">
              {preset.faqs.map((f) => (
                <li key={f.q}>
                  <span className="font-medium text-foreground">{f.q}</span>
                  <span className="block text-muted-foreground">{f.a}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("presetBooking")}</p>
            <p className="mt-2 text-sm text-foreground">{to(`preset_booking_${pick}`)}</p>
            <p className="mt-3 text-xs text-muted-foreground">{t("presetLanguageNote")}</p>
          </div>
        </div>
        <Button
          className="mt-4"
          onClick={() => {
            leadStore.set((x) => applyPreset(x, pick));
            toast.success(t("presetApplied", { type: to(`industry_${pick}`) }));
          }}
        >
          {s.industry === pick ? t("reapplyPreset") : t("applyPreset")}
        </Button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-semibold text-foreground">{t("aiTitle")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t("aiDesc")}</p>
        <p className="mb-2 text-sm font-medium text-foreground">{t("tone")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["friendly", "professional", "concise"] as const).map((tone) => (
            <button
              key={tone}
              type="button"
              aria-pressed={ai.tone === tone}
              onClick={() => setAi({ tone })}
              className={cn("flex flex-col items-start justify-start rounded-xl border p-3 text-left text-sm", ai.tone === tone ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}
            >
              <span className="font-medium text-foreground">{t(`tone_${tone}`)}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t(`toneExample_${tone}`)}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <MessageCircleQuestion className="size-4 text-primary" />
            {t("faqsTitle")}
          </p>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setAi({ faqs: [...ai.faqs, { q: "", a: "" }] })}>
            <Plus className="size-3.5" />
            {t("addFaq")}
          </Button>
        </div>
        <div className="mt-3 space-y-3">
          {ai.faqs.map((f, i) => (
            <div key={i} className="grid gap-2 rounded-xl bg-muted/50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
              <Input value={f.q} placeholder={t("faqQuestion")} aria-label={t("faqQuestion")} onChange={(e) => setAi({ faqs: ai.faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
              <Input value={f.a} placeholder={t("faqAnswer")} aria-label={t("faqAnswer")} onChange={(e) => setAi({ faqs: ai.faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
              <Button variant="ghost" size="icon-sm" className="self-center" aria-label={t("removeFaq")} onClick={() => setAi({ faqs: ai.faqs.filter((_, j) => j !== i) })}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-1.5">
          <Label htmlFor="ai-fallback">{t("fallback")}</Label>
          <Textarea id="ai-fallback" rows={2} value={ai.fallback} onChange={(e) => setAi({ fallback: e.target.value })} />
          <p className="text-xs text-muted-foreground">{t("fallbackHint")}</p>
        </div>
        <Button className="mt-5" onClick={() => toast.success(t("saved"))}>
          {t("save")}
        </Button>
      </section>
    </div>
  );
}
