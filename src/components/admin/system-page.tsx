"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, CircleX, Loader2, Play, RotateCcw } from "lucide-react";

import { BarChart } from "@/components/tremor/bar-chart";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { JOBS, SERVICES, SYSTEM_EVENTS, WEBHOOK_HOURS, businessById, type ServiceStatus, type SystemEvent } from "@/lib/admin/data";
import { num, numCompact, pct, relTime } from "@/lib/admin/format";
import { act, adminStore, useAdmin } from "@/lib/admin/store";
import { DataTable, EmptyState, PageHeader, Panel, Pill, td } from "./admin-ui";

const SERVICE_ICON = { operational: CheckCircle2, degraded: CircleAlert, down: CircleX } as const;
const SERVICE_TONE = { operational: "text-emerald-600", degraded: "text-amber-500", down: "text-rose-600" } as const;
const SOURCE_LABEL: Record<SystemEvent["source"], string> = { meta: "Meta webhook", razorpay: "Razorpay", send: "Message send", ai: "AI" };

function ServiceCard({ s }: { s: ServiceStatus }) {
  const Icon = SERVICE_ICON[s.status];
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{s.name}</p>
          <p className="text-xs text-muted-foreground">{s.detail}</p>
        </div>
        <Icon className={cn("size-5 shrink-0", SERVICE_TONE[s.status])} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <Pill tone={s.status === "operational" ? "green" : s.status === "degraded" ? "amber" : "red"}>{s.status === "operational" ? "Operational" : s.status === "degraded" ? "Slow" : "Down"}</Pill>
        <span className="text-muted-foreground tabular-nums">
          {s.uptime}% uptime · {num(s.latencyMs)} ms
        </span>
      </div>
      {/* 30-day uptime strip: one bar per day. */}
      <div className="mt-3 flex h-6 items-end gap-[2px]" aria-hidden>
        {Array.from({ length: 30 }, (_, i) => {
          const bad = s.status !== "operational" && (i === 29 || i === 17);
          const warn = !bad && (i * 7 + s.id.length) % 23 === 0;
          return <span key={i} className={cn("h-full flex-1 rounded-sm", bad ? "bg-amber-400" : warn ? "bg-amber-200 dark:bg-amber-900" : "bg-emerald-500/70")} />;
        })}
      </div>
    </div>
  );
}

export function SystemPage() {
  const { resolvedEvents, jobRuns } = useAdmin();
  const [source, setSource] = useState<SystemEvent["source"] | "all">("all");
  const [show, setShow] = useState<"open" | "all">("open");
  const [running, setRunning] = useState<string | null>(null);

  const isResolved = (e: SystemEvent) => e.resolved || resolvedEvents.includes(e.id);
  const events = SYSTEM_EVENTS.filter((e) => (source === "all" || e.source === source) && (show === "all" || !isResolved(e)));
  const delivered = WEBHOOK_HOURS.reduce((s, h) => s + h.delivered, 0);
  const failed = WEBHOOK_HOURS.reduce((s, h) => s + h.failed, 0);
  const allOk = SERVICES.every((s) => s.status === "operational");

  const resolve = (e: SystemEvent, how: "resolved" | "retried") => {
    act(how === "retried" ? "Retried event" : "Resolved error", businessById(e.businessId)?.name ?? e.businessId, `${e.code}: ${e.message}`, (s) => ({ resolvedEvents: [...s.resolvedEvents, e.id] }));
    toast.success(how === "retried" ? "Retried successfully" : "Marked as resolved");
  };

  return (
    <>
      <PageHeader title="System status" description="The services AutoShift depends on, Meta webhooks, scheduled jobs and recent errors." />

      <div className={cn("flex items-center gap-3 rounded-2xl border p-4", allOk ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5")}>
        {allOk ? <CheckCircle2 className="size-6 text-emerald-600" /> : <CircleAlert className="size-6 text-amber-500" />}
        <div>
          <p className="font-semibold text-foreground">{allOk ? "All systems operational" : "Some services are slow"}</p>
          <p className="text-sm text-muted-foreground">{allOk ? "Everything is working normally." : SERVICES.filter((s) => s.status !== "operational").map((s) => `${s.name} (${s.detail}) is slower than usual.`).join(" ")}</p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SERVICES.map((s) => (
          <ServiceCard key={s.id} s={s} />
        ))}
      </div>

      <Panel title="Meta webhook deliveries" description={`Last 24 hours · ${num(delivered)} delivered · ${num(failed)} failed (${pct(failed / (delivered + failed), 2)})`}>
        <BarChart className="h-52" data={WEBHOOK_HOURS.map((h) => ({ hour: h.hour, Delivered: h.delivered, Failed: h.failed }))} index="hour" categories={["Delivered", "Failed"]} colors={["brand", "pink"]} type="stacked" yAxisWidth={44} valueFormatter={(v) => numCompact(v)} />
      </Panel>

      <Panel title="Scheduled jobs" bodyClassName="px-0 pb-0">
        <DataTable head={["Job", "Schedule", "Last run", "Took", "Status", ""]}>
          {JOBS.map((j) => {
            const ranNow = jobRuns[j.id];
            const status = ranNow ? "ok" : j.status;
            return (
              <tr key={j.id}>
                <td className={cn(td, "font-medium")}>{j.name}</td>
                <td className={cn(td, "text-muted-foreground")}>{j.schedule}</td>
                <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{ranNow ? "just now" : relTime(j.lastRun)}</td>
                <td className={cn(td, "tabular-nums text-muted-foreground")}>{j.durationS < 60 ? `${j.durationS}s` : `${Math.round(j.durationS / 60)}m`}</td>
                <td className={td}>
                  <Pill tone={status === "ok" ? "green" : status === "failed" ? "red" : "blue"}>{status === "ok" ? "OK" : status === "failed" ? "Failed" : "Running"}</Pill>
                </td>
                <td className={cn(td, "text-right")}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={running === j.id || status === "running"}
                    onClick={() => {
                      setRunning(j.id);
                      setTimeout(() => {
                        act("Ran job", j.name, "Started by hand");
                        adminStore.set((s) => ({ ...s, jobRuns: { ...s.jobRuns, [j.id]: new Date().toISOString() } }));
                        setRunning(null);
                        toast.success(`${j.name} finished`);
                      }, 900);
                    }}
                  >
                    {running === j.id ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                    Run now
                  </Button>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>

      <Panel
        title="Recent errors"
        description="Failed sends, webhook and payment problems. Retry or mark as resolved once handled."
        actions={
          <div className="flex gap-2">
            <NativeSelect value={source} onChange={(e) => setSource(e.target.value as typeof source)} aria-label="Source" size="sm" className="w-40">
              <option value="all">All sources</option>
              {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Show" size="sm" className="w-32">
              <option value="open">Open</option>
              <option value="all">All</option>
            </NativeSelect>
          </div>
        }
        bodyClassName="px-0 pb-0"
      >
        <DataTable head={["When", "Source", "Business", "Error", "Retries", ""]} className="[&_table]:min-w-[860px]" empty={events.length === 0 ? <EmptyState icon={CheckCircle2} title="No open errors" detail="Nice and quiet." /> : undefined}>
          {events.map((e) => {
            const b = businessById(e.businessId);
            const done = isResolved(e);
            return (
              <tr key={e.id} className={cn(done && "opacity-60")}>
                <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{relTime(e.at)}</td>
                <td className={cn(td, "whitespace-nowrap")}>{SOURCE_LABEL[e.source]}</td>
                <td className={td}>
                  {b && (
                    <Link href={`/admin/businesses/${b.id}`} className="hover:underline">
                      {b.name}
                    </Link>
                  )}
                </td>
                <td className={td}>
                  <span className="text-foreground">{e.message}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{e.code}</span>
                </td>
                <td className={cn(td, "tabular-nums")}>{e.retries}</td>
                <td className={cn(td, "text-right whitespace-nowrap")}>
                  {done ? (
                    <Pill tone="green">Resolved</Pill>
                  ) : (
                    <div className="flex justify-end gap-1.5">
                      {e.source !== "razorpay" && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => resolve(e, "retried")}>
                          <RotateCcw className="size-3.5" />
                          Retry
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => resolve(e, "resolved")}>
                        Resolve
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
    </>
  );
}
