"use client";

import { useTranslations } from "next-intl";
import { Flame, Snowflake, ThermometerSun } from "lucide-react";

import { cn } from "@/lib/utils";
import { phoneKey, scoreLead, temperature, useLeadSettings, useLeads, type Lead, type LeadSettings, type LeadTemp } from "@/lib/leads/model";

const TONE: Record<LeadTemp, string> = {
  hot: "bg-destructive/10 text-destructive",
  warm: "bg-[var(--tone-butter)] text-[#7A5A0E] dark:text-amber-300",
  cold: "bg-[var(--tone-sky)] text-[#24508F] dark:text-sky-300",
};
const ICON: Record<LeadTemp, typeof Flame> = { hot: Flame, warm: ThermometerSun, cold: Snowflake };

export function TempChip({ temp, score, className }: { temp: LeadTemp; score?: number; className?: string }) {
  const t = useTranslations("Leads");
  const Icon = ICON[temp];
  return (
    <span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", TONE[temp], className)}>
      <Icon className="size-3" />
      {t(`temp_${temp}`)}
      {score !== undefined && <span className="font-normal">· {score}</span>}
    </span>
  );
}

export function leadScore(lead: Lead, settings: LeadSettings) {
  const score = scoreLead(lead.answers, settings.rules);
  return { score, temp: temperature(score, settings.thresholds) };
}

/** Contacts table cell: the lead temperature for this phone number, or a dash. */
export function LeadScoreCell({ phone }: { phone: string | null }) {
  const settings = useLeadSettings();
  const leads = useLeads();
  const lead = leads.find((l) => phoneKey(l.phone) && phoneKey(l.phone) === phoneKey(phone));
  if (!lead) return <span className="text-xs text-muted-foreground">-</span>;
  const { score, temp } = leadScore(lead, settings);
  return <TempChip temp={temp} score={score} />;
}
