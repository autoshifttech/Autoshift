"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Target, UserCheck } from "lucide-react";

import { leadsStore, phoneKey, useLeadSettings, useLeads } from "@/lib/leads/model";
import { TempChip, leadScore } from "./lead-ui";

/** Inbox side panel: the lead's score and answers, with a manual hand-off. Matched by phone number. */
export function LeadCard({ phone }: { phone: string | null }) {
  const t = useTranslations("Leads");
  const settings = useLeadSettings();
  const leads = useLeads();
  const lead = leads.find((l) => phoneKey(l.phone) && phoneKey(l.phone) === phoneKey(phone));
  if (!lead) return null;
  const { score, temp } = leadScore(lead, settings);
  return (
    <div className="mb-4 border-b border-border pb-4">
      <div className="flex items-center justify-between px-1">
        <span className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          <Target className="h-3 w-3" />
          {t("cardTitle")}
        </span>
        <TempChip temp={temp} score={score} />
      </div>
      <dl className="mt-2 space-y-1 rounded-lg bg-muted px-3 py-2 text-xs">
        {settings.questions
          .filter((q) => lead.answers[q.id])
          .map((q) => (
            <div key={q.id} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{q.saveAs}</dt>
              <dd className="text-right font-medium text-foreground">{lead.answers[q.id]}</dd>
            </div>
          ))}
      </dl>
      {lead.handedOffTo ? (
        <p className="mt-2 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <UserCheck className="h-3.5 w-3.5 text-primary" />
          {t("handedTo", { name: lead.handedOffTo })}
        </p>
      ) : (
        <button
          type="button"
          className="mt-2 px-1 text-xs font-medium text-primary hover:underline"
          onClick={() => {
            leadsStore.set((s) => ({ leads: s.leads.map((l) => (l.id === lead.id ? { ...l, handedOffTo: t("you") } : l)) }));
            toast.success(t("takenOver"));
          }}
        >
          {t("takeOver")}
        </button>
      )}
    </div>
  );
}
