"use client";

import { useState } from "react";
import { Download, FileClock, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { ADMIN_NOW, ROLE_LABEL } from "@/lib/admin/data";
import { dateTime, downloadCsv } from "@/lib/admin/format";
import { useAdmin } from "@/lib/admin/store";
import { DataTable, EmptyState, PageHeader, Panel, Pill, td } from "./admin-ui";

/** Group actions so the filter stays short. */
function category(action: string): string {
  if (/refund|payment|credit|price|plan|coupon|setting/i.test(action)) return "Money";
  if (/block|trial|view|note|business|setup|quality/i.test(action)) return "Businesses";
  if (/ticket|replied/i.test(action)) return "Support";
  if (/announcement/i.test(action)) return "Announcements";
  if (/admin|sign|role|invite/i.test(action)) return "Team & access";
  return "System";
}

const CATEGORY_TONE: Record<string, "green" | "amber" | "blue" | "violet" | "gray" | "red"> = { Money: "amber", Businesses: "blue", Support: "violet", Announcements: "green", "Team & access": "red", System: "gray" };

export function AuditPage() {
  const { audit } = useAdmin();
  const [query, setQuery] = useState("");
  const [actor, setActor] = useState("all");
  const [cat, setCat] = useState("all");
  const [range, setRange] = useState("all");

  const actors = [...new Set(audit.map((a) => a.actor))];
  const q = query.trim().toLowerCase();
  const rows = audit.filter((a) => {
    if (actor !== "all" && a.actor !== actor) return false;
    if (cat !== "all" && category(a.action) !== cat) return false;
    // New entries carry the real clock time, so compare against whichever is later.
    if (range !== "all" && Math.max(ADMIN_NOW, Date.parse(audit[0]?.at ?? "")) - new Date(a.at).getTime() > Number(range) * 864e5) return false;
    return !q || `${a.action} ${a.target} ${a.details} ${a.actor}`.toLowerCase().includes(q);
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every sign-in and change made in the admin panel: who, what, when and from where. Entries can't be edited or deleted."
        actions={
          <Button variant="outline" className="gap-1.5" onClick={() => downloadCsv("autoshift-audit-log.csv", [["When", "Who", "Role", "Action", "Target", "Details", "IP"], ...rows.map((a) => [a.at, a.actor, ROLE_LABEL[a.role], a.action, a.target, a.details, a.ip])])}>
            <Download className="size-4" />
            Export CSV
          </Button>
        }
      />
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-2 border-b border-border p-4 lg:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search actions, businesses or details" aria-label="Search audit log" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
            <NativeSelect value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Who" className="lg:w-40">
              <option value="all">Everyone</option>
              {actors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Type" className="lg:w-40">
              <option value="all">All actions</option>
              {Object.keys(CATEGORY_TONE).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={range} onChange={(e) => setRange(e.target.value)} aria-label="When" className="col-span-2 sm:col-span-1 lg:w-36">
              <option value="all">All time</option>
              <option value="1">Last 24 hours</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </NativeSelect>
          </div>
        </div>
        <DataTable head={["When", "Who", "Action", "Target", "Details", "IP address"]} className="[&_table]:min-w-[960px]" empty={rows.length === 0 ? <EmptyState icon={FileClock} title="No entries match" /> : undefined}>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{dateTime(a.at)}</td>
              <td className={td}>
                <p className="font-medium text-foreground">{a.actor}</p>
                <p className="text-xs text-muted-foreground">{ROLE_LABEL[a.role]}</p>
              </td>
              <td className={td}>
                <div className="flex flex-col items-start gap-1">
                  <span className="font-medium">{a.action}</span>
                  <Pill tone={CATEGORY_TONE[category(a.action)]} dot={false}>
                    {category(a.action)}
                  </Pill>
                </div>
              </td>
              <td className={td}>{a.target}</td>
              <td className={cn(td, "max-w-xs text-muted-foreground")}>{a.details || "—"}</td>
              <td className={cn(td, "font-mono text-xs text-muted-foreground")}>{a.ip}</td>
            </tr>
          ))}
        </DataTable>
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          {rows.length} of {audit.length} entries · kept for 2 years
        </p>
      </Panel>
    </>
  );
}
