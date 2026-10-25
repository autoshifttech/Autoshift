"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, GitBranch, Hand, ListChecks, Plus, Sparkles, Trash2, UserCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Bubble, QuickButtons, WhatsAppPreview } from "@/components/booking/whatsapp-preview";
import { selectClass } from "@/components/booking/booking-ui";
import { cn } from "@/lib/utils";
import { useSetup } from "@/lib/workspace/setup";
import {
  SAMPLE_PIPELINES,
  leadStore,
  scoreLead,
  temperature,
  useLeadSettings,
  useLeads,
  type AnswerType,
  type LeadQuestion,
  type LeadSettings,
  type RuleOp,
  type ScoreRule,
} from "@/lib/leads/model";
import { TempChip, leadScore } from "./lead-ui";
import { NativeSelect } from "@/components/ui/native-select"

const set = (patch: Partial<LeadSettings>) => leadStore.set((s) => ({ ...s, ...patch }));

function Section({ icon: Icon, title, desc, children, action }: { icon: typeof Hand; title: string; desc: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--tone-mint)] text-primary">
            <Icon className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{desc}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LeadCapturePanel() {
  const t = useTranslations("Leads");
  const s = useLeadSettings();
  const setup = useSetup();
  const business = setup.business.displayName || setup.business.name || "AutoShift";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={s.enabled} onCheckedChange={(enabled) => set({ enabled })} />
          <span>
            <span className="font-semibold text-foreground">{t("enabledTitle")}</span>
            <span className="block text-muted-foreground">{t("enabledDesc")}</span>
          </span>
        </label>
        <Link href="/agents?tab=presets" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <Sparkles className="size-4" />
          {t("usePreset")}
        </Link>
      </div>

      <RecentLeads />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <QuestionsSection />
          <ScoringSection />
          <HandoffSection />
          <RoutingSection />
          <div className="flex justify-end">
            <Button onClick={() => toast.success(t("saved"))}>{t("save")}</Button>
          </div>
        </div>
        <aside className="space-y-3 xl:sticky xl:top-0 xl:self-start">
          <p className="text-sm font-medium text-foreground">{t("previewTitle")}</p>
          <WhatsAppPreview title={business}>
            <Bubble from="customer" time="18:40">
              {t("previewHello")}
            </Bubble>
            {s.questions.slice(0, 4).map((question) => (
              <div key={question.id} className="space-y-1">
                <Bubble from="business" time="18:40">
                  {question.prompt}
                </Bubble>
                {question.type === "choice" && question.options.some(Boolean) && <QuickButtons labels={question.options.filter(Boolean).slice(0, 3)} />}
              </div>
            ))}
            <Bubble from="business" time="18:41">
              {s.handoff.handoffMessage}
            </Bubble>
          </WhatsAppPreview>
          <p className="text-xs text-muted-foreground">{t("previewNote")}</p>
        </aside>
      </div>
    </div>
  );
}

function RecentLeads() {
  const t = useTranslations("Leads");
  const s = useLeadSettings();
  const leads = useLeads();
  const scored = leads.map((l) => ({ lead: l, ...leadScore(l, s) }));
  const counts = { hot: 0, warm: 0, cold: 0 };
  scored.forEach((x) => counts[x.temp]++);
  return (
    <section className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold text-foreground">{t("recentTitle")}</h2>
        <div className="flex gap-2">
          {(["hot", "warm", "cold"] as const).map((temp) => (
            <span key={temp} className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <TempChip temp={temp} /> {counts[temp]}
            </span>
          ))}
        </div>
      </div>
      <div className="divide-y divide-border">
        {scored.map(({ lead, score, temp }) => (
          <div key={lead.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <span className="font-medium text-foreground sm:w-36">{lead.name}</span>
            <TempChip temp={temp} score={score} />
            <span className="order-last min-w-0 basis-full truncate text-muted-foreground sm:order-none sm:flex-1 sm:basis-auto">
              {s.questions
                .filter((q) => q.id !== "name" && lead.answers[q.id])
                .map((q) => `${q.saveAs}: ${lead.answers[q.id]}`)
                .join(" · ") || t("noAnswers")}
            </span>
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground sm:ml-0">
              {lead.handedOffTo ? (
                <>
                  <UserCheck className="size-3.5 text-primary" />
                  {lead.handedOffTo}
                </>
              ) : (
                t("withAi")
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuestionsSection() {
  const t = useTranslations("Leads");
  const s = useLeadSettings();
  const update = (id: string, patch: Partial<LeadQuestion>) => set({ questions: s.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) });
  const move = (i: number, dir: -1 | 1) => {
    const next = [...s.questions];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    set({ questions: next });
  };
  return (
    <Section
      icon={ListChecks}
      title={t("questionsTitle")}
      desc={t("questionsDesc")}
      action={
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => set({ questions: [...s.questions, { id: `q${Date.now()}`, prompt: "", saveAs: "", type: "text", options: [], required: false }] })}
        >
          <Plus className="size-3.5" />
          {t("addQuestion")}
        </Button>
      }
    >
      <ol className="space-y-3">
        {s.questions.map((q, i) => (
          <li key={q.id} className="rounded-xl border border-border p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">{i + 1}</span>
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_150px_120px]">
                <Input value={q.prompt} placeholder={t("questionPh")} aria-label={t("question")} onChange={(e) => update(q.id, { prompt: e.target.value })} />
                <Input value={q.saveAs} placeholder={t("saveAsPh")} aria-label={t("saveAs")} onChange={(e) => update(q.id, { saveAs: e.target.value })} />
                <NativeSelect className={selectClass} value={q.type} aria-label={t("answerType")} onChange={(e) => update(q.id, { type: e.target.value as AnswerType })}>
                  {(["text", "choice", "number"] as const).map((type) => (
                    <option key={type} value={type}>
                      {t(`type_${type}`)}
                    </option>
                  ))}
                </NativeSelect>
                {q.type === "choice" && (
                  <Input
                    className="sm:col-span-3"
                    value={q.options.join(", ")}
                    placeholder={t("optionsPh")}
                    aria-label={t("options")}
                    onChange={(e) => update(q.id, { options: e.target.value.split(",").map((o) => o.trimStart()) })}
                  />
                )}
              </div>
              <div className="flex shrink-0 items-center">
                <Button variant="ghost" size="icon-sm" aria-label={t("moveUp")} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("moveDown")} disabled={i === s.questions.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("removeQuestion")}
                  onClick={() => set({ questions: s.questions.filter((x) => x.id !== q.id), rules: s.rules.filter((r) => r.questionId !== q.id) })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <label className="mt-2 ml-8 flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={q.required} onCheckedChange={(required) => update(q.id, { required })} />
              {t("required")}
            </label>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function ScoringSection() {
  const t = useTranslations("Leads");
  const s = useLeadSettings();
  const [test, setTest] = useState<Record<string, string>>({});
  const score = scoreLead(test, s.rules);
  const update = (id: string, patch: Partial<ScoreRule>) => set({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  return (
    <Section
      icon={Sparkles}
      title={t("scoringTitle")}
      desc={t("scoringDesc")}
      action={
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={!s.questions.length}
          onClick={() => set({ rules: [...s.rules, { id: `r${Date.now()}`, questionId: s.questions[0].id, op: "answered", value: "", points: 10 }] })}
        >
          <Plus className="size-3.5" />
          {t("addRule")}
        </Button>
      }
    >
      <div className="space-y-2">
        {s.rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-2 text-sm">
            <span className="px-1 text-muted-foreground">{t("ruleIf")}</span>
            <NativeSelect className={cn(selectClass, "w-auto")} value={r.questionId} aria-label={t("question")} onChange={(e) => update(r.id, { questionId: e.target.value })}>
              {s.questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.saveAs || q.prompt}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect className={cn(selectClass, "w-auto")} value={r.op} aria-label={t("condition")} onChange={(e) => update(r.id, { op: e.target.value as RuleOp })}>
              {(["answered", "equals", "contains", "at_least"] as const).map((op) => (
                <option key={op} value={op}>
                  {t(`op_${op}`)}
                </option>
              ))}
            </NativeSelect>
            {r.op !== "answered" && <Input className="h-9 w-32" value={r.value} aria-label={t("value")} onChange={(e) => update(r.id, { value: e.target.value })} />}
            <span className="text-muted-foreground">{t("ruleAdd")}</span>
            <Input className="h-9 w-20" type="number" value={r.points} aria-label={t("points")} onChange={(e) => update(r.id, { points: Number(e.target.value) })} />
            <span className="text-muted-foreground">{t("pointsUnit")}</span>
            <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={t("removeRule")} onClick={() => set({ rules: s.rules.filter((x) => x.id !== r.id) })}>
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="th-hot">{t("hotFrom")}</Label>
          <Input id="th-hot" type="number" min={1} max={100} value={s.thresholds.hot} onChange={(e) => set({ thresholds: { ...s.thresholds, hot: Number(e.target.value) } })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="th-warm">{t("warmFrom")}</Label>
          <Input id="th-warm" type="number" min={0} max={100} value={s.thresholds.warm} onChange={(e) => set({ thresholds: { ...s.thresholds, warm: Number(e.target.value) } })} />
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{t("thresholdHint")}</p>

      <div className="mt-5 rounded-xl border border-dashed border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">{t("tryTitle")}</p>
          <TempChip temp={temperature(score, s.thresholds)} score={score} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {s.questions.map((q) =>
            q.type === "choice" ? (
              <NativeSelect key={q.id} className={selectClass} value={test[q.id] ?? ""} aria-label={q.saveAs} onChange={(e) => setTest({ ...test, [q.id]: e.target.value })}>
                <option value="">{q.saveAs || q.prompt}</option>
                {q.options.filter(Boolean).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </NativeSelect>
            ) : (
              <Input key={q.id} placeholder={q.saveAs || q.prompt} aria-label={q.saveAs} value={test[q.id] ?? ""} onChange={(e) => setTest({ ...test, [q.id]: e.target.value })} />
            ),
          )}
        </div>
      </div>
    </Section>
  );
}

function HandoffSection() {
  const t = useTranslations("Leads");
  const s = useLeadSettings();
  const h = s.handoff;
  const [keyword, setKeyword] = useState("");
  const upd = (patch: Partial<LeadSettings["handoff"]>) => set({ handoff: { ...h, ...patch } });
  return (
    <Section icon={Hand} title={t("handoffTitle")} desc={t("handoffDesc")}>
      <div className="space-y-3 text-sm">
        <label className="flex items-center gap-3">
          <Switch checked={h.onHot} onCheckedChange={(onHot) => upd({ onHot })} />
          {t("handoffHot")}
        </label>
        <label className="flex items-center gap-3">
          <Switch checked={h.onHumanRequest} onCheckedChange={(onHumanRequest) => upd({ onHumanRequest })} />
          {t("handoffHuman")}
        </label>
      </div>
      <p className="mt-4 mb-2 text-sm font-medium text-foreground">{t("keywordsTitle")}</p>
      <div className="flex flex-wrap items-center gap-2">
        {h.keywords.map((k) => (
          <span key={k} className="flex items-center gap-1 rounded-full bg-muted py-1 pr-1.5 pl-3 text-sm text-foreground">
            {k}
            <button type="button" aria-label={t("removeKeyword", { keyword: k })} onClick={() => upd({ keywords: h.keywords.filter((x) => x !== k) })} className="rounded-full p-0.5 hover:bg-background">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const k = keyword.trim().toLowerCase();
            if (k && !h.keywords.includes(k)) upd({ keywords: [...h.keywords, k] });
            setKeyword("");
          }}
        >
          <Input className="h-8 w-40" value={keyword} placeholder={t("keywordPh")} aria-label={t("keywordPh")} onChange={(e) => setKeyword(e.target.value)} />
          <Button size="sm" variant="outline" type="submit">
            {t("add")}
          </Button>
        </form>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="ho-assign">{t("assignTo")}</Label>
          <NativeSelect id="ho-assign" className={selectClass} value={h.assignTo} onChange={(e) => upd({ assignTo: e.target.value as typeof h.assignTo })}>
            {(["round_robin", "least_busy", "owner"] as const).map((a) => (
              <option key={a} value={a}>
                {t(`assign_${a}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid content-start gap-2 text-sm">
          <span className="font-medium text-foreground">{t("notify")}</span>
          <label className="flex items-center gap-2.5">
            <Switch checked={h.notifyInApp} onCheckedChange={(notifyInApp) => upd({ notifyInApp })} />
            {t("notifyInApp")}
          </label>
          <label className="flex items-center gap-2.5">
            <Switch checked={h.notifyEmail} onCheckedChange={(notifyEmail) => upd({ notifyEmail })} />
            {t("notifyEmail")}
          </label>
        </div>
      </div>
      <div className="mt-5 grid gap-1.5">
        <Label htmlFor="ho-msg">{t("handoffMessage")}</Label>
        <Textarea id="ho-msg" rows={2} value={h.handoffMessage} onChange={(e) => upd({ handoffMessage: e.target.value })} />
      </div>
    </Section>
  );
}

function RoutingSection() {
  const t = useTranslations("Leads");
  const s = useLeadSettings();
  const r = s.routing;
  const stages = SAMPLE_PIPELINES[r.pipeline] ?? [];
  const upd = (patch: Partial<LeadSettings["routing"]>) => set({ routing: { ...r, ...patch } });
  return (
    <Section icon={GitBranch} title={t("routingTitle")} desc={t("routingDesc")} action={<Switch checked={r.enabled} onCheckedChange={(enabled) => upd({ enabled })} aria-label={t("routingTitle")} />}>
      <div className={cn("grid gap-4 sm:grid-cols-2", !r.enabled && "pointer-events-none opacity-50")}>
        <div className="grid gap-1.5">
          <Label htmlFor="rt-pipeline">{t("pipeline")}</Label>
          <NativeSelect id="rt-pipeline" className={selectClass} value={r.pipeline} onChange={(e) => upd({ pipeline: e.target.value, stageHot: SAMPLE_PIPELINES[e.target.value][1], stageWarm: SAMPLE_PIPELINES[e.target.value][0] })}>
            {Object.keys(SAMPLE_PIPELINES).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rt-value">{t("dealValue")}</Label>
          <NativeSelect id="rt-value" className={selectClass} value={r.valueFromQuestionId ?? ""} onChange={(e) => upd({ valueFromQuestionId: e.target.value || null })}>
            <option value="">{t("noValue")}</option>
            {s.questions
              .filter((q) => q.type === "number")
              .map((q) => (
                <option key={q.id} value={q.id}>
                  {q.saveAs}
                </option>
              ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rt-hot">{t("stageHot")}</Label>
          <NativeSelect id="rt-hot" className={selectClass} value={r.stageHot} onChange={(e) => upd({ stageHot: e.target.value })}>
            {stages.map((st) => (
              <option key={st}>{st}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rt-warm">{t("stageWarm")}</Label>
          <NativeSelect id="rt-warm" className={selectClass} value={r.stageWarm} onChange={(e) => upd({ stageWarm: e.target.value })}>
            {stages.map((st) => (
              <option key={st}>{st}</option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("coldNote")}</p>
    </Section>
  );
}
