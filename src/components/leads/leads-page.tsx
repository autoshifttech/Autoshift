"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarPlus, Download, MessageSquare, Search, Settings2, UserCheck } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookingDialog } from "@/components/booking/booking-dialog";
import { useDrips } from "@/lib/drips/model";
import { cn } from "@/lib/utils";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  leadsStore,
  scoreBreakdown,
  scoreLead,
  temperature,
  useLeadSettings,
  useLeads,
  type Lead,
  type LeadSettings,
  type LeadStatus,
  type LeadTemp,
} from "@/lib/leads/model";
import { TempChip } from "./lead-ui";

const TEAM = ["Asha Kumar", "Rahul Iyer"];

export const STATUS_TONE: Record<LeadStatus, string> = {
  new: "bg-[var(--tone-sky)] text-[#24508F] dark:text-sky-300",
  contacted: "bg-[var(--tone-butter)] text-[#7A5A0E] dark:text-amber-300",
  qualified: "bg-[var(--tone-lilac)] text-[#6A2E80] dark:text-fuchsia-300",
  won: "bg-[var(--tone-mint)] text-primary",
  lost: "bg-muted text-muted-foreground",
};

function scored(lead: Lead, s: LeadSettings) {
  const score = scoreLead(lead.answers, s.rules);
  return { lead, score, temp: temperature(score, s.thresholds) };
}

function relative(iso: string, locale: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (mins < 60) return rtf.format(-mins, "minute");
  if (mins < 60 * 24) return rtf.format(-Math.round(mins / 60), "hour");
  return rtf.format(-Math.round(mins / 1440), "day");
}

function setLead(id: string, patch: Partial<Lead>, event?: Lead["events"][number]) {
  leadsStore.set((s) => ({ leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch, events: event ? [...l.events, event] : l.events } : l)) }));
}

export function LeadsPage() {
  const t = useTranslations("LeadsPage");
  const locale = useLocale();
  const settings = useLeadSettings();
  const leads = useLeads();
  const [query, setQuery] = useState("");
  const [temp, setTemp] = useState<LeadTemp | "all">("all");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [source, setSource] = useState("all");
  const [owner, setOwner] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const all = leads.map((l) => scored(l, settings)).sort((a, b) => b.lead.capturedAt.localeCompare(a.lead.capturedAt));
  const rows = all.filter(({ lead, temp: tp }) => {
    const q = query.trim().toLowerCase();
    if (q && !`${lead.name} ${lead.phone} ${Object.values(lead.answers).join(" ")}`.toLowerCase().includes(q)) return false;
    if (temp !== "all" && tp !== temp) return false;
    if (status !== "all" && lead.status !== status) return false;
    if (source !== "all" && lead.source !== source) return false;
    if (owner === "ai" && lead.handedOffTo) return false;
    if (owner !== "all" && owner !== "ai" && lead.handedOffTo !== owner) return false;
    return true;
  });
  const count = (tp: LeadTemp) => all.filter((x) => x.temp === tp).length;
  const won = all.filter((x) => x.lead.status === "won").length;
  const open = all.find((x) => x.lead.id === openId) ?? null;

  const exportCsv = () => {
    const head = ["Name", "Phone", "Temperature", "Score", "Status", "Source", "Assistant", "Assigned to", "Captured", ...settings.questions.map((q) => q.saveAs)];
    const body = rows.map(({ lead, score, temp: tp }) => [lead.name, lead.phone, tp, score, lead.status, lead.source, lead.assistant, lead.handedOffTo ?? "", lead.capturedAt, ...settings.questions.map((q) => lead.answers[q.id] ?? "")]);
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "autoshift-leads.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("exported", { count: rows.length }));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="sr-only">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex gap-2 self-start">
          <Link href="/agents?tab=leads" className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}>
            <Settings2 className="size-4" />
            {t("settings")}
          </Link>
          <Button onClick={exportCsv} className="gap-1.5">
            <Download className="size-4" />
            {t("export")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { key: "all" as const, label: t("statTotal"), value: all.length },
          { key: "hot" as const, label: t("statHot"), value: count("hot") },
          { key: "warm" as const, label: t("statWarm"), value: count("warm") },
          { key: "cold" as const, label: t("statCold"), value: count("cold") },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={temp === s.key}
            onClick={() => setTemp(s.key)}
            className={cn("rounded-2xl border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors", temp === s.key ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary/40")}
          >
            <span className="flex items-center justify-between text-xs text-muted-foreground">
              {s.label}
              {s.key !== "all" && <TempChip temp={s.key} />}
            </span>
            <span className="mt-1 block text-2xl font-semibold text-foreground">{s.value}</span>
          </button>
        ))}
        <div className="col-span-2 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] lg:col-span-1">
          <span className="text-xs text-muted-foreground">{t("statConversion")}</span>
          <span className="mt-1 block text-2xl font-semibold text-foreground">{all.length ? Math.round((won / all.length) * 100) : 0}%</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={query} placeholder={t("search")} aria-label={t("search")} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-2 lg:w-[540px]">
          <NativeSelect value={status} aria-label={t("colStatus")} onChange={(e) => setStatus(e.target.value as LeadStatus | "all")}>
            <option value="all">{t("allStatuses")}</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status_${s}`)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={source} aria-label={t("colSource")} onChange={(e) => setSource(e.target.value)}>
            <option value="all">{t("allSources")}</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`source_${s}`)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={owner} aria-label={t("colOwner")} onChange={(e) => setOwner(e.target.value)}>
            <option value="all">{t("anyOwner")}</option>
            <option value="ai">{t("withAi")}</option>
            {TEAM.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t("colLead")}</th>
              <th className="px-4 py-3 font-medium">{t("colScore")}</th>
              <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
              <th className="px-4 py-3 font-medium">{t("colSource")}</th>
              <th className="px-4 py-3 font-medium">{t("colNeed")}</th>
              <th className="px-4 py-3 font-medium">{t("colOwner")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("colCaptured")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  {t("empty")}
                </td>
              </tr>
            )}
            {rows.map(({ lead, score, temp: tp }) => (
              <tr key={lead.id} onClick={() => setOpenId(lead.id)} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="block font-medium text-foreground">{lead.name}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{lead.phone}</span>
                </td>
                <td className="px-4 py-3">
                  <TempChip temp={tp} score={score} />
                </td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[lead.status])}>{t(`status_${lead.status}`)}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{t(`source_${lead.source}`)}</td>
                <td className="max-w-56 truncate px-4 py-3 text-muted-foreground">
                  {settings.questions
                    .filter((q) => q.id !== "name" && lead.answers[q.id])
                    .slice(0, 3)
                    .map((q) => lead.answers[q.id])
                    .join(" · ") || "—"}
                </td>
                <td className="px-4 py-3">
                  {lead.handedOffTo ? (
                    <span className="flex items-center gap-1.5 text-foreground">
                      <UserCheck className="size-3.5 text-primary" />
                      {lead.handedOffTo}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{lead.assistant}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground">{relative(lead.capturedAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">{open && <LeadDetail {...open} settings={settings} />}</SheetContent>
      </Sheet>
    </div>
  );
}

function LeadDetail({ lead, score, temp, settings }: { lead: Lead; score: number; temp: LeadTemp; settings: LeadSettings }) {
  const t = useTranslations("LeadsPage");
  const locale = useLocale();
  const [booking, setBooking] = useState(false);
  const drips = useDrips().filter((d) => d.status !== "draft");
  const matched = scoreBreakdown(lead.answers, settings.rules);
  const qName = (id: string) => settings.questions.find((q) => q.id === id)?.saveAs ?? id;
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <TempChip temp={temp} score={score} />
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[lead.status])}>{t(`status_${lead.status}`)}</span>
        </div>
        <SheetTitle className="text-lg">{lead.name}</SheetTitle>
        <SheetDescription>
          {lead.phone} · {t(`source_${lead.source}`)}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-6 px-4 pb-6">
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs text-muted-foreground">{t("colStatus")}</span>
            <NativeSelect value={lead.status} onChange={(e) => setLead(lead.id, { status: e.target.value as LeadStatus }, { at: new Date().toISOString(), kind: "status", text: e.target.value })}>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status_${s}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs text-muted-foreground">{t("assignTo")}</span>
            <NativeSelect
              value={lead.handedOffTo ?? ""}
              onChange={(e) => {
                const who = e.target.value || null;
                setLead(lead.id, { handedOffTo: who }, who ? { at: new Date().toISOString(), kind: "handoff", text: who } : undefined);
              }}
            >
              <option value="">{t("withAi")}</option>
              {TEAM.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link href="/inbox" className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}>
            <MessageSquare className="size-4" />
            {t("openChat")}
          </Link>
          <Button variant="outline" className="gap-1.5" onClick={() => setBooking(true)}>
            <CalendarPlus className="size-4" />
            {t("book")}
          </Button>
        </div>

        <label className="grid gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">{t("addToDrip")}</span>
          <NativeSelect
            value=""
            onChange={(e) => {
              const drip = drips.find((d) => d.id === e.target.value);
              if (!drip) return;
              setLead(lead.id, {}, { at: new Date().toISOString(), kind: "note", text: t("ev_drip", { name: drip.name }) });
              toast.success(t("addedToDrip", { name: drip.name }));
            }}
          >
            <option value="">{t("chooseDrip")}</option>
            {drips.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </label>

        <section>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("answers")}</h3>
          <dl className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
            {settings.questions.map((q) => (
              <div key={q.id} className="flex justify-between gap-3 px-3 py-2">
                <dt className="text-muted-foreground">{q.saveAs}</dt>
                <dd className={cn("text-right font-medium", lead.answers[q.id] ? "text-foreground" : "text-muted-foreground/60")}>{lead.answers[q.id] ?? t("notAsked")}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("whyScore", { score })}</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {matched.length === 0 && <li className="text-muted-foreground">{t("noPoints")}</li>}
            {matched.map((r) => (
              <li key={r.id} className="flex justify-between gap-3">
                <span className="text-foreground">{t(`why_${r.op}`, { field: qName(r.questionId), value: r.value })}</span>
                <span className="font-medium text-primary">+{r.points}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("timeline")}</h3>
          <ol className="mt-3 space-y-3 border-l border-border pl-4">
            {[...lead.events].sort((a, b) => b.at.localeCompare(a.at)).map((e, i) => (
              <li key={i} className="relative text-sm">
                <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-primary" />
                <span className="block text-foreground">
                  {e.kind === "captured"
                    ? t("ev_captured", { source: t(`source_${e.text}`), assistant: lead.assistant })
                    : e.kind === "answered"
                      ? t("ev_answered", { count: Number(e.text) })
                      : e.kind === "handoff"
                        ? t("ev_handoff", { name: e.text })
                        : e.kind === "status"
                          ? t("ev_status", { status: t(`status_${e.text}`) })
                          : e.kind === "booked"
                            ? t("ev_booked", { what: e.text })
                            : e.text}
                </span>
                <span className="block text-xs text-muted-foreground">{new Date(e.at).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {booking && <BookingDialog open onOpenChange={setBooking} defaults={{ contactName: lead.name, phone: lead.phone }} />}
    </>
  );
}
