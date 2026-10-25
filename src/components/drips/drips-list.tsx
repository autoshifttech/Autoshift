"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, Pause, Play, Plus, Repeat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/wallet/model";
import { costPerContact, dripsStore, newDrip, updateDrip, useDrips } from "@/lib/drips/model";
import { DripStatusChip, useTriggerText } from "./drip-ui";

export function DripsList() {
  return (
    <Suspense fallback={null}>
      <DripsListInner />
    </Suspense>
  );
}

function DripsListInner() {
  const t = useTranslations("Drips");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const drips = useDrips();
  const triggerText = useTriggerText();
  const handled = useRef(false);

  const create = (trigger?: Parameters<typeof newDrip>[0]) => {
    const d = newDrip(trigger);
    dripsStore.set((s) => ({ drips: [...s.drips, d] }));
    router.push(`/drips/${d.id}`);
  };

  // "Drip" on a segment card lands here with ?segment=… — start a drip for it.
  useEffect(() => {
    const segment = params.get("segment");
    if (segment && !handled.current) {
      handled.current = true;
      create({ kind: "segment", value: segment });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const totals = drips.reduce((s, d) => ({ active: s.active + d.stats.active, replied: s.replied + d.stats.replied, booked: s.booked + d.stats.booked, enrolled: s.enrolled + d.stats.enrolled }), { active: 0, replied: 0, booked: 0, enrolled: 0 });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="sr-only">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button onClick={() => create()} className="gap-1.5 self-start">
          <Plus className="size-4" />
          {t("newDrip")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [t("statInProgress"), totals.active],
          [t("statEnrolled"), totals.enrolled],
          [t("statReplyRate"), `${totals.enrolled ? Math.round((totals.replied / totals.enrolled) * 100) : 0}%`],
          [t("statBooked"), totals.booked],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{typeof v === "number" ? v.toLocaleString(locale) : v}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {drips.map((d) => (
          <div key={d.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--tone-mint)] text-primary">
                <Repeat className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/drips/${d.id}`} className="truncate font-semibold text-foreground hover:underline">
                    {d.name || t("untitled")}
                  </Link>
                  <DripStatusChip status={d.status} />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {triggerText(d.trigger)} · {t("stepsCount", { count: d.steps.length })} · {t("perContact", { amount: formatMoney(costPerContact(d), locale) })}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-4 gap-4 text-center lg:w-[400px]">
              {[
                [t("colEnrolled"), d.stats.enrolled],
                [t("colActive"), d.stats.active],
                [t("colReplied"), d.stats.enrolled ? `${Math.round((d.stats.replied / d.stats.enrolled) * 100)}%` : "—"],
                [t("colBooked"), d.stats.booked],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-[11px] text-muted-foreground">{k}</dt>
                  <dd className="font-semibold text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex gap-1 lg:justify-end">
              {d.status !== "draft" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    updateDrip(d.id, { status: d.status === "active" ? "paused" : "active" });
                    toast.success(d.status === "active" ? t("pausedToast") : t("resumedToast"));
                  }}
                >
                  {d.status === "active" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  {d.status === "active" ? t("pause") : t("resume")}
                </Button>
              )}
              <Link href={`/drips/${d.id}`} className="inline-flex h-8 items-center rounded-full px-3 text-sm font-medium text-primary hover:bg-muted">
                {t("open")}
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("duplicate")}
                onClick={() => {
                  dripsStore.set((s) => ({ drips: [...s.drips, { ...structuredClone(d), id: `dr-${Date.now()}`, name: t("copyOf", { name: d.name }), status: "draft", stats: { enrolled: 0, active: 0, completed: 0, replied: 0, booked: 0 } }] }));
                  toast.success(t("duplicated"));
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
