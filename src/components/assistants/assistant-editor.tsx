"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, Hand, Plus, Settings2, Trash2, Users, Wrench, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatMoney, RATES } from "@/lib/wallet/model";
import { assistantsStore, updateAssistant, useAssistants, type Assistant, type Audience, type Tone } from "@/lib/assistants/model";
import { AssistantAvatar, TestChat, toolIcon } from "./assistant-ui";

const COLORS = ["#1E4C41", "#2563EB", "#7C5CBF", "#C2410C", "#B45309", "#BE185D", "#0F766E"];
const AUDIENCES: Audience[] = ["all", "new_contacts", "tagged", "after_hours"];
const AI_PRICE = RATES.find((r) => r.kind === "ai")?.price ?? 0;

export function AssistantEditor({ id }: { id: string }) {
  const t = useTranslations("Assistants");
  const { assistants, tools } = useAssistants();
  const router = useRouter();
  const a = assistants.find((x) => x.id === id);

  if (!a) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <p className="text-sm text-muted-foreground">{t("notFound")}</p>
        <Link href="/agents" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          {t("backToList")}
        </Link>
      </div>
    );
  }

  const set = (patch: Partial<Assistant>) => updateAssistant(a.id, patch);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href="/agents" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </div>
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center">
        <AssistantAvatar assistant={a} className="size-12 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight text-foreground">{a.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t(`role_${a.role}`)} · {t(`audience_${a.audience}`)}
          </p>
        </div>
        <label className="flex items-center gap-2.5 text-sm font-medium text-foreground">
          <Switch checked={a.enabled} onCheckedChange={(enabled) => set({ enabled })} />
          {a.enabled ? t("on") : t("off")}
        </label>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-destructive hover:text-destructive"
          onClick={() => {
            assistantsStore.set((s) => ({ ...s, assistants: s.assistants.filter((x) => x.id !== a.id) }));
            toast.success(t("deleted", { name: a.name }));
            router.push("/agents");
          }}
        >
          <Trash2 className="size-4" />
          {t("delete")}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Tabs defaultValue="profile">
          <TabsList className="max-w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsTrigger value="profile">
              <Settings2 className="mr-1.5 h-4 w-4" />
              {t("tabProfile")}
            </TabsTrigger>
            <TabsTrigger value="knowledge">
              <BookOpen className="mr-1.5 h-4 w-4" />
              {t("tabKnowledge")}
            </TabsTrigger>
            <TabsTrigger value="tools">
              <Wrench className="mr-1.5 h-4 w-4" />
              {t("tabTools")}
            </TabsTrigger>
            <TabsTrigger value="audience">
              <Users className="mr-1.5 h-4 w-4" />
              {t("tabAudience")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="mt-4">
            <ProfileTab a={a} set={set} />
          </TabsContent>
          <TabsContent value="knowledge" className="mt-4">
            <KnowledgeTab a={a} set={set} />
          </TabsContent>
          <TabsContent value="tools" className="mt-4">
            <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-foreground">{t("toolsTitle")}</h2>
                  <p className="text-sm text-muted-foreground">{t("toolsDesc")}</p>
                </div>
                <Link href="/ai-tools" className="shrink-0 text-sm font-medium text-primary hover:underline">
                  {t("manageTools")}
                </Link>
              </div>
              <ul className="divide-y divide-border">
                {tools.map((tool) => {
                  const Icon = toolIcon(tool);
                  const on = a.toolIds.includes(tool.id);
                  return (
                    <li key={tool.id} className={cn("flex items-start gap-3 py-3", !tool.enabled && "opacity-50")}>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--tone-mint)] text-primary">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {tool.name}
                          {!tool.builtin && <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t("custom")}</span>}
                          {!tool.enabled && <span className="ml-2 text-[11px] text-muted-foreground">{t("toolOffEverywhere")}</span>}
                        </span>
                        <span className="block text-xs text-muted-foreground">{tool.description}</span>
                      </span>
                      <Switch
                        checked={on}
                        disabled={!tool.enabled}
                        aria-label={tool.name}
                        onCheckedChange={(v) => set({ toolIds: v ? [...a.toolIds, tool.id] : a.toolIds.filter((x) => x !== tool.id) })}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          </TabsContent>
          <TabsContent value="audience" className="mt-4">
            <AudienceTab a={a} set={set} />
          </TabsContent>
        </Tabs>

        <div className="space-y-4 xl:sticky xl:top-0 xl:self-start">
          <TestChat key={a.id + a.greeting} assistant={a} tools={tools} className="h-[560px]" />
          <UsageCard a={a} />
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ a, set }: { a: Assistant; set: (p: Partial<Assistant>) => void }) {
  const t = useTranslations("Assistants");
  const tl = useTranslations("Leads");
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="as-name">{t("name")}</Label>
          <Input id="as-name" value={a.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="as-model">{t("model")}</Label>
          <NativeSelect id="as-model" value={a.model} onChange={(e) => set({ model: e.target.value as Assistant["model"] })}>
            <option value="fast">{t("model_fast")}</option>
            <option value="smart">{t("model_smart")}</option>
          </NativeSelect>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{t("colour")}</p>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={a.color === c}
              onClick={() => set({ color: c })}
              className={cn("size-7 rounded-full ring-offset-2 ring-offset-card", a.color === c && "ring-2 ring-foreground")}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{tl("tone")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["friendly", "professional", "concise"] as Tone[]).map((tone) => (
            <button
              key={tone}
              type="button"
              aria-pressed={a.tone === tone}
              onClick={() => set({ tone })}
              className={cn("flex flex-col items-start rounded-xl border p-3 text-left text-sm", a.tone === tone ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}
            >
              <span className="font-medium text-foreground">{tl(`tone_${tone}`)}</span>
              <span className="mt-0.5 text-xs text-muted-foreground">{tl(`toneExample_${tone}`)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="as-instr">{t("instructions")}</Label>
        <Textarea id="as-instr" rows={6} value={a.instructions} placeholder={t("instructionsPh")} onChange={(e) => set({ instructions: e.target.value })} />
        <p className="text-xs text-muted-foreground">{t("instructionsHint")}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="as-greet">{t("greeting")}</Label>
        <Input id="as-greet" value={a.greeting} placeholder={t("greetingPh")} onChange={(e) => set({ greeting: e.target.value })} />
      </div>
      <SaveRow />
    </section>
  );
}

function KnowledgeTab({ a, set }: { a: Assistant; set: (p: Partial<Assistant>) => void }) {
  const t = useTranslations("Assistants");
  const update = (i: number, patch: Partial<Assistant["knowledge"][number]>) => set({ knowledge: a.knowledge.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground">{t("knowledgeTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("knowledgeDesc")}</p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => set({ knowledge: [...a.knowledge, { q: "", a: "" }] })}>
          <Plus className="size-3.5" />
          {t("addFaq")}
        </Button>
      </div>
      {a.knowledge.length === 0 && <p className="rounded-xl bg-muted/60 p-6 text-center text-sm text-muted-foreground">{t("knowledgeEmpty")}</p>}
      <div className="space-y-3">
        {a.knowledge.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-xl bg-muted/50 p-3">
            <div className="flex gap-2">
              <Input value={f.q} placeholder={t("faqQuestion")} aria-label={t("faqQuestion")} onChange={(e) => update(i, { q: e.target.value })} />
              <Button variant="ghost" size="icon" aria-label={t("removeFaq")} onClick={() => set({ knowledge: a.knowledge.filter((_, j) => j !== i) })}>
                <X className="size-4" />
              </Button>
            </div>
            <Textarea rows={2} value={f.a} placeholder={t("faqAnswer")} aria-label={t("faqAnswer")} onChange={(e) => update(i, { a: e.target.value })} />
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {t("docsHint")}{" "}
        <Link href="/agents?tab=setup" className="font-medium text-primary hover:underline">
          {t("docsLink")}
        </Link>
      </p>
    </section>
  );
}

function AudienceTab({ a, set }: { a: Assistant; set: (p: Partial<Assistant>) => void }) {
  const t = useTranslations("Assistants");
  const [tag, setTag] = useState("");
  return (
    <section className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div>
        <h2 className="font-semibold text-foreground">{t("audienceTitle")}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t("audienceDesc")}</p>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
          {AUDIENCES.map((aud) => (
            <button
              key={aud}
              type="button"
              role="radio"
              aria-checked={a.audience === aud}
              onClick={() => set({ audience: aud })}
              className={cn("rounded-xl border p-3 text-left text-sm", a.audience === aud ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}
            >
              <span className="block font-medium text-foreground">{t(`audience_${aud}`)}</span>
              <span className="block text-xs text-muted-foreground">{t(`audienceDesc_${aud}`)}</span>
            </button>
          ))}
        </div>
        {a.audience === "tagged" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {a.tags.map((x) => (
              <span key={x} className="flex items-center gap-1 rounded-full bg-muted py-1 pr-1.5 pl-3 text-sm">
                {x}
                <button type="button" aria-label={t("removeTag", { tag: x })} onClick={() => set({ tags: a.tags.filter((y) => y !== x) })} className="rounded-full p-0.5 hover:bg-background">
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (tag.trim() && !a.tags.includes(tag.trim())) set({ tags: [...a.tags, tag.trim()] });
                setTag("");
              }}
            >
              <Input className="h-8 w-36" value={tag} placeholder={t("tagPh")} aria-label={t("tagPh")} onChange={(e) => setTag(e.target.value)} />
              <Button size="sm" variant="outline" type="submit">
                {t("add")}
              </Button>
            </form>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t("priorityNote")}</p>
      </div>

      <div className="border-t border-border pt-5">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <Hand className="size-4 text-primary" />
          {t("handoffTitle")}
        </h2>
        <div className="mt-3 space-y-3 text-sm">
          <label className="flex items-center gap-3">
            <Switch checked={a.handoff.onRequest} onCheckedChange={(onRequest) => set({ handoff: { ...a.handoff, onRequest } })} />
            {t("handoffRequest")}
          </label>
          <label className="flex items-center gap-3">
            <Switch checked={a.handoff.onUnknown} onCheckedChange={(onUnknown) => set({ handoff: { ...a.handoff, onUnknown } })} />
            {t("handoffUnknown")}
          </label>
          <label className="flex flex-wrap items-center gap-3">
            <span>{t("handoffMax")}</span>
            <NativeSelect className="w-28" value={a.handoff.maxReplies} onChange={(e) => set({ handoff: { ...a.handoff, maxReplies: Number(e.target.value) } })}>
              {[5, 10, 15, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <Switch checked={a.captureLeads} onCheckedChange={(captureLeads) => set({ captureLeads })} />
          <span>
            {t("captureLeads")}{" "}
            <Link href="/agents?tab=leads" className="font-medium text-primary hover:underline">
              {t("editQuestions")}
            </Link>
          </span>
        </label>
      </div>
      <SaveRow />
    </section>
  );
}

function UsageCard({ a }: { a: Assistant }) {
  const t = useTranslations("Assistants");
  const locale = useLocale();
  const handoffRate = a.stats.replies ? Math.round((a.stats.handoffs / Math.max(1, a.stats.replies / 6)) * 100) : 0;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <p className="text-sm font-semibold text-foreground">{t("usageTitle")}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t("statReplies")}</dt>
          <dd className="font-semibold text-foreground">{a.stats.replies.toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("cost")}</dt>
          <dd className="font-semibold text-foreground">{formatMoney(a.stats.replies * AI_PRICE, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("statLeads")}</dt>
          <dd className="font-semibold text-foreground">{a.stats.leads}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("handoffRate")}</dt>
          <dd className="font-semibold text-foreground">{handoffRate}%</dd>
        </div>
      </dl>
    </section>
  );
}

function SaveRow() {
  const t = useTranslations("Assistants");
  return (
    <div className="flex justify-end">
      <Button onClick={() => toast.success(t("saved"))}>{t("save")}</Button>
    </div>
  );
}
