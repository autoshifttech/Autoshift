"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CalendarCheck, Hand, MessageSquare, Plus, Target, Wrench } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatMoney, RATES } from "@/lib/wallet/model";
import { ASSISTANT_ROLES, ROLE_PRESETS, assistantsStore, newAssistant, updateAssistant, useAssistants, type AssistantRole } from "@/lib/assistants/model";
import { AssistantAvatar } from "./assistant-ui";

const AI_PRICE = RATES.find((r) => r.kind === "ai")?.price ?? 0;

/** AI Agents → Assistants: every assistant with its status, reach and cost. */
export function AssistantsList() {
  const t = useTranslations("Assistants");
  const locale = useLocale();
  const router = useRouter();
  const { assistants, tools } = useAssistants();
  const [creating, setCreating] = useState(false);

  const create = (role: AssistantRole) => {
    const a = newAssistant(role);
    assistantsStore.set((s) => ({ ...s, assistants: [...s.assistants, a] }));
    setCreating(false);
    router.push(`/agents/${a.id}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("listTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("listDesc")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/ai-tools" className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}>
            <Wrench className="size-4" />
            {t("manageTools")}
          </Link>
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="size-4" />
            {t("newAssistant")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {assistants.map((a) => {
          const activeTools = a.toolIds.filter((id) => tools.some((x) => x.id === id && x.enabled)).length;
          return (
            <div key={a.id} className={cn("flex flex-col rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-colors", !a.enabled && "opacity-75")}>
              <div className="flex items-start gap-3">
                <AssistantAvatar assistant={a} />
                <div className="min-w-0 flex-1">
                  <Link href={`/agents/${a.id}`} className="block truncate font-semibold text-foreground hover:underline">
                    {a.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {t(`role_${a.role}`)} · {t(`audience_${a.audience}`)}
                  </p>
                </div>
                <Switch checked={a.enabled} onCheckedChange={(enabled) => updateAssistant(a.id, { enabled })} aria-label={t("enabledLabel", { name: a.name })} />
              </div>
              <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">{a.instructions || t("noInstructions")}</p>
              <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  { icon: MessageSquare, value: a.stats.replies, label: t("statReplies") },
                  { icon: Target, value: a.stats.leads, label: t("statLeads") },
                  { icon: CalendarCheck, value: a.stats.bookings, label: t("statBookings") },
                  { icon: Hand, value: a.stats.handoffs, label: t("statHandoffs") },
                ].map(({ icon: Icon, value, label }) => (
                  <div key={label} className="rounded-xl bg-muted/60 px-1 py-2">
                    <dt className="sr-only">{label}</dt>
                    <Icon className="mx-auto size-3.5 text-muted-foreground" aria-hidden />
                    <dd className="mt-0.5 text-sm font-semibold text-foreground">{value.toLocaleString(locale)}</dd>
                    <span className="block truncate text-xs text-muted-foreground" aria-hidden>
                      {label}
                    </span>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <span>
                  {t("toolsCount", { count: activeTools })} · {t("costMonth", { amount: formatMoney(a.stats.replies * AI_PRICE, locale) })}
                </span>
                <Link href={`/agents/${a.id}`} className="font-medium text-primary hover:underline">
                  {t("open")}
                </Link>
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Plus className="size-6" />
          {t("newAssistant")}
        </button>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("newTitle")}</DialogTitle>
            <DialogDescription>{t("newDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {ASSISTANT_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => create(role)}
                className="flex items-start gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
              >
                <AssistantAvatar assistant={ROLE_PRESETS[role]} className="size-9 rounded-lg" />
                <span>
                  <span className="block text-sm font-semibold text-foreground">{t(`role_${role}`)}</span>
                  <span className="block text-xs text-muted-foreground">{t(`roleDesc_${role}`)}</span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
