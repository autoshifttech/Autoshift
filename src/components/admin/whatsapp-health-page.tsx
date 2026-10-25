"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileX2, PhoneOff, Search, Send, ShieldAlert, ShieldCheck, Signal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { TIERS, seeded, type Business, type Quality } from "@/lib/admin/data";
import { num, relTime } from "@/lib/admin/format";
import { act, useBusinesses } from "@/lib/admin/store";
import { DataTable, EmptyState, Initials, Kpi, Meter, PageHeader, Panel, Pill, QUALITY_META, QualityPill, StatusPill, td } from "./admin-ui";

const REJECTION_REASONS = [
  "Promotional content in a Utility template",
  "Variables at the start or end of the message",
  "Missing sample values for variables",
  "Looks like it asks for sensitive information",
  "Too many variables for the amount of text",
];

/** Sample rejections with Meta's reasons, until template sync reads them from Meta. */
function sampleRejections(connected: Business[]) {
  const r = seeded(9);
  return connected
    .filter((b) => b.whatsapp.templatesRejected > 0)
    .slice(0, 8)
    .map((b) => ({ b, template: r.pick(["festive_offer", "order_update", "appointment_reminder", "new_arrivals", "payment_due", "welcome_message"]), reason: r.pick(REJECTION_REASONS), at: new Date(Date.UTC(2026, 9, 25) - r.int(1, 20) * 864e5).toISOString() }));
}

export function WhatsAppHealthPage() {
  const businesses = useBusinesses();
  const [quality, setQuality] = useState<Quality | "all">("all");
  const [query, setQuery] = useState("");

  const connected = businesses.filter((b) => b.whatsapp.status === "connected" && b.status !== "cancelled" && b.status !== "expired");
  const byQuality = (q: Quality) => connected.filter((b) => b.whatsapp.quality === q).length;
  const notConnected = businesses.filter((b) => b.whatsapp.status !== "connected" && (b.status === "trial" || b.status === "active" || b.status === "past_due"));
  const rejected = connected.reduce((s, b) => s + b.whatsapp.templatesRejected, 0);
  const approved = connected.reduce((s, b) => s + b.whatsapp.templatesApproved, 0);

  const q = query.trim().toLowerCase();
  const order: Record<Quality, number> = { red: 0, yellow: 1, green: 2 };
  const rows = connected
    .filter((b) => quality === "all" || b.whatsapp.quality === quality)
    .filter((b) => !q || `${b.name} ${b.whatsapp.number}`.toLowerCase().includes(q))
    .sort((a, b) => order[a.whatsapp.quality] - order[b.whatsapp.quality] || b.usage.marketing - a.usage.marketing);

  const rejections = sampleRejections(connected);

  const tierCounts = TIERS.map((t) => ({ t, n: connected.filter((b) => b.whatsapp.tier === t).length }));
  const maxTier = Math.max(...tierCounts.map((x) => x.n), 1);

  return (
    <>
      <PageHeader title="WhatsApp health" description="Every connected number: Meta's quality rating, messaging limit and template approvals. Low quality numbers can be limited or banned by Meta." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Signal} label="Connected numbers" value={num(connected.length)} />
        <Kpi icon={ShieldCheck} tone="mint" label="High quality" value={num(byQuality("green"))} />
        <Kpi icon={ShieldAlert} tone="butter" label="Medium quality" value={num(byQuality("yellow"))} hint="watch these" />
        <Kpi icon={ShieldAlert} tone="peach" label="Low quality" value={num(byQuality("red"))} hint="act now" />
        <Kpi icon={PhoneOff} tone="sky" label="Not connected" value={num(notConnected.length)} hint="trial or paying" />
        <Kpi icon={FileX2} tone="lilac" label="Templates rejected" value={num(rejected)} hint={`${num(approved)} approved`} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel bodyClassName="p-0">
          <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search business or number" aria-label="Search numbers" />
            </div>
            <NativeSelect value={quality} onChange={(e) => setQuality(e.target.value as Quality | "all")} aria-label="Quality" className="sm:w-44">
              <option value="all">Any quality</option>
              <option value="red">Low quality</option>
              <option value="yellow">Medium quality</option>
              <option value="green">High quality</option>
            </NativeSelect>
          </div>
          <DataTable head={["Business", "Number", "Quality", "Limit / 24h", "Marketing (30d)", "Templates", ""]} className="[&_table]:min-w-[860px]" empty={rows.length === 0 ? <EmptyState icon={Signal} title="No numbers match" /> : undefined}>
            {rows.map((b) => (
              <tr key={b.id} className={cn(b.whatsapp.quality === "red" && "bg-rose-500/[0.04]")}>
                <td className={td}>
                  <Link href={`/admin/businesses/${b.id}`} className="flex items-center gap-3 hover:underline">
                    <Initials name={b.name} className="size-8 text-[10px]" />
                    <span className="font-medium whitespace-nowrap text-foreground">{b.name}</span>
                  </Link>
                </td>
                <td className={cn(td, "whitespace-nowrap font-mono text-xs")}>{b.whatsapp.number}</td>
                <td className={td}>
                  <QualityPill quality={b.whatsapp.quality} />
                </td>
                <td className={cn(td, "tabular-nums")}>{b.whatsapp.tier}</td>
                <td className={cn(td, "tabular-nums")}>{num(b.usage.marketing)}</td>
                <td className={cn(td, "whitespace-nowrap tabular-nums")}>
                  {b.whatsapp.templatesApproved} ok{b.whatsapp.templatesRejected > 0 && <span className="text-rose-600"> · {b.whatsapp.templatesRejected} rejected</span>}
                </td>
                <td className={cn(td, "text-right")}>
                  {b.whatsapp.quality !== "green" && (
                    <Button
                      size="icon-sm"
                      variant="outline"
                      title="Send tips to the owner"
                      aria-label={`Send quality tips to ${b.name}`}
                      onClick={() => {
                        act("Sent quality warning", b.name, `Quality ${QUALITY_META[b.whatsapp.quality].label.toLowerCase()}: tips on opt-ins and frequency`);
                        toast.success(`Tips sent to ${b.owner.name}`);
                      }}
                    >
                      <Send className="size-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>

        <div className="space-y-6">
          <Panel title="Messaging limits" description="How many customers each number can start chats with per day.">
            <ul className="space-y-3">
              {tierCounts.map(({ t, n }) => (
                <li key={t}>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground">{t}</span>
                    <span className="text-muted-foreground tabular-nums">{n}</span>
                  </div>
                  <Meter value={n} max={maxTier} className="mt-1" />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Signed up, not connected" description="They can't send messages yet. A setup call usually fixes it." bodyClassName="px-0 pb-2">
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {notConnected.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Link href={`/admin/businesses/${b.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground hover:underline">{b.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <StatusPill status={b.status} /> joined {relTime(b.createdAt)}
                    </span>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Send setup help to ${b.name}`}
                    onClick={() => {
                      act("Sent setup help", b.name, "WhatsApp connection guide and call link");
                      toast.success(`Setup help sent to ${b.owner.name}`);
                    }}
                  >
                    <Send className="size-4" />
                  </Button>
                </li>
              ))}
              {notConnected.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">Everyone is connected.</li>}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel title="Recent template rejections" description="Meta's reason, so you can help them fix and resubmit." bodyClassName="px-0 pb-0">
        <DataTable head={["Business", "Template", "Reason", "When"]}>
          {rejections.map(({ b, template, reason, at }, i) => (
            <tr key={i}>
              <td className={cn(td, "font-medium")}>
                <Link href={`/admin/businesses/${b.id}`} className="hover:underline">
                  {b.name}
                </Link>
              </td>
              <td className={cn(td, "font-mono text-xs")}>{template}</td>
              <td className={td}>
                <Pill tone="red" dot={false}>
                  {reason}
                </Pill>
              </td>
              <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{relTime(at)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
