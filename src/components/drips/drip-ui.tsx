"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useSegments } from "@/lib/segments/model";
import type { Drip, DripStatus } from "@/lib/drips/model";

const TONE: Record<DripStatus, string> = {
  active: "bg-[var(--tone-mint)] text-primary",
  paused: "bg-[var(--tone-butter)] text-[#7A5A0E] dark:text-amber-300",
  draft: "bg-muted text-muted-foreground",
};

export function DripStatusChip({ status }: { status: DripStatus }) {
  const t = useTranslations("Drips");
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", TONE[status])}>
    {status === "active" && <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />}
    {t(`status_${status}`)}
  </span>;
}

/** "Enters when: …" in words. */
export function useTriggerText() {
  const t = useTranslations("Drips");
  const segments = useSegments();
  return (trigger: Drip["trigger"]) => {
    switch (trigger.kind) {
      case "segment":
        return t("trigger_segment_text", { name: segments.find((s) => s.id === trigger.value)?.name ?? "—" });
      case "new_lead":
        return t("trigger_new_lead_text", { temp: t(`temp_${trigger.value}`) });
      case "tag_added":
        return t("trigger_tag_added_text", { tag: trigger.value });
      case "after_booking":
        return t("trigger_after_booking_text");
      case "manual":
        return t("trigger_manual_text");
    }
  };
}
