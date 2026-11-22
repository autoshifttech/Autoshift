"use client";

import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { Target, UserCheck } from "lucide-react";

import { assignLiveLeadToMe, leadsStore, phoneKey, useLeadSettings, useLeads } from "@/lib/leads/model";
import { TempChip, leadScore } from "./lead-ui";

/** Inbox side panel: the lead's score and answers, with a manual hand-off. Matched by phone number. */
export function LeadCard({ phone }: { phone: string | null }) {
  const t = useTranslations("Leads");
  const settings = useLeadSettings();
  const leads = useLeads();
  const lead = leads.find((l) => phoneKey(l.phone) && phoneKey(l.phone) === phoneKey(phone));
  if (!lead) return null;
  const { score, temp } = leadScore(lead, settings);
  const answered = settings.questions.filter((q) => lead.answers[q.id]);
  return (
    <section className="rounded-2xl p-3 ring-1 ring-border">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          <Target className="size-3.5" />
          {t("cardTitle")}
        </h3>
        <TempChip temp={temp} score={score} />
      </div>
      {answered.length > 0 && (
        <dl className="mt-2.5 divide-y divide-border overflow-hidden rounded-xl bg-muted/50 text-xs">
          {answered.map((q) => (
            <div key={q.id} className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">{q.saveAs}</dt>
              <dd className="text-right font-medium text-foreground">{lead.answers[q.id]}</dd>
            </div>
          ))}
        </dl>
      )}
      {lead.handedOffTo ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <UserCheck className="size-3.5 text-primary" />
          {t("handedTo", { name: lead.handedOffTo })}
        </p>
      ) : (
        <button
          type="button"
          className="mt-2.5 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-primary/30 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => {
            leadsStore.set((s) => ({ leads: s.leads.map((l) => (l.id === lead.id ? { ...l, handedOffTo: t("you") } : l)) }));
            assignLiveLeadToMe(lead.id).catch((err) => toast.error(err instanceof Error ? err.message : String(err)));
            toast.success(t("takenOver"));
          }}
        >
          <UserCheck className="size-3.5" />
          {t("takeOver")}
        </button>
      )}
    </section>
  );
}
