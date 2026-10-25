"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Download, Flag, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { INDUSTRY_LABEL, type BusinessStatus, type NumberStatus } from "@/lib/admin/data";
import { date, downloadCsv, inr, num, relTime } from "@/lib/admin/format";
import { useBusinesses } from "@/lib/admin/store";
import { DataTable, EmptyState, Initials, NUMBER_META, PageHeader, Panel, Pill, QUALITY_META, STATUS_META, StatusPill, Segmented, td } from "./admin-ui";

type StatusFilter = BusinessStatus | "all";
type Sort = "newest" | "oldest" | "mrr" | "wallet" | "messages" | "active";

const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "mrr", label: "Highest MRR" },
  { value: "messages", label: "Most messages" },
  { value: "wallet", label: "Lowest wallet" },
  { value: "active", label: "Recently active" },
];

export function BusinessesPage() {
  const businesses = useBusinesses();
  const router = useRouter();
  const params = useSearchParams();
  const status = (params.get("status") as StatusFilter) || "all";
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [plan, setPlan] = useState("all");
  const [wa, setWa] = useState<NumberStatus | "all">("all");
  const [industry, setIndustry] = useState("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [flagged, setFlagged] = useState(false);

  const setStatus = (s: StatusFilter) => {
    const next = new URLSearchParams(params.toString());
    if (s === "all") next.delete("status");
    else next.set("status", s);
    router.replace(`/admin/businesses${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: businesses.length };
    for (const b of businesses) c[b.status] = (c[b.status] ?? 0) + 1;
    return c;
  }, [businesses]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const messages = (b: (typeof businesses)[number]) => b.usage.marketing + b.usage.utility + b.usage.authentication + b.usage.service;
    return businesses
      .filter((b) => status === "all" || b.status === status)
      .filter((b) => plan === "all" || b.plan === plan)
      .filter((b) => wa === "all" || b.whatsapp.status === wa)
      .filter((b) => industry === "all" || b.industry === industry)
      .filter((b) => !flagged || b.flags.length > 0)
      .filter((b) => !q || `${b.name} ${b.owner.name} ${b.owner.email} ${b.city} ${b.whatsapp.number}`.toLowerCase().includes(q))
      .sort((a, b) => {
        switch (sort) {
          case "oldest":
            return a.createdAt.localeCompare(b.createdAt);
          case "mrr":
            return b.mrr - a.mrr;
          case "wallet":
            return a.wallet - b.wallet;
          case "messages":
            return messages(b) - messages(a);
          case "active":
            return b.lastActiveAt.localeCompare(a.lastActiveAt);
          default:
            return b.createdAt.localeCompare(a.createdAt);
        }
      });
  }, [businesses, status, plan, wa, industry, flagged, query, sort]);

  const exportCsv = () =>
    downloadCsv("autoshift-businesses.csv", [
      ["ID", "Business", "Owner", "Email", "Phone", "City", "Industry", "Status", "Plan", "Billing", "MRR", "Wallet", "WhatsApp", "Number", "Quality", "Joined", "Last active", "Flags"],
      ...rows.map((b) => [b.id, b.name, b.owner.name, b.owner.email, b.owner.phone, b.city, INDUSTRY_LABEL[b.industry], STATUS_META[b.status].label, b.plan, b.cycle, b.mrr, b.wallet, NUMBER_META[b.whatsapp.status].label, b.whatsapp.number, b.whatsapp.quality, b.createdAt.slice(0, 10), b.lastActiveAt.slice(0, 10), b.flags.join("; ")]),
    ]);

  return (
    <>
      <PageHeader
        title="Businesses"
        description="Every workspace on AutoShift: plan, WhatsApp connection, wallet and activity."
        actions={
          <Button variant="outline" className="gap-1.5" onClick={exportCsv}>
            <Download className="size-4" />
            Export CSV
          </Button>
        }
      />

      <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Segmented
          value={status}
          onChange={setStatus}
          options={(["all", "trial", "active", "past_due", "expired", "cancelled", "blocked"] as const).map((s) => ({ value: s, label: `${s === "all" ? "All" : STATUS_META[s].label} · ${counts[s] ?? 0}` }))}
        />
      </div>

      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-2 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, owner, email, city or number" aria-label="Search businesses" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
            <NativeSelect value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan" className="lg:w-36">
              <option value="all">All plans</option>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="pro">Pro</option>
            </NativeSelect>
            <NativeSelect value={wa} onChange={(e) => setWa(e.target.value as NumberStatus | "all")} aria-label="WhatsApp" className="lg:w-44">
              <option value="all">Any WhatsApp status</option>
              <option value="connected">Connected</option>
              <option value="not_connected">Not connected</option>
              <option value="disconnected">Disconnected</option>
            </NativeSelect>
            <NativeSelect value={industry} onChange={(e) => setIndustry(e.target.value)} aria-label="Industry" className="lg:w-44">
              <option value="all">All industries</option>
              {Object.entries(INDUSTRY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="lg:w-40">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <button
            type="button"
            aria-pressed={flagged}
            onClick={() => setFlagged(!flagged)}
            className={cn("inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-sm", flagged ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300" : "border-border text-muted-foreground hover:bg-muted")}
          >
            <Flag className="size-3.5" />
            Needs attention
          </button>
        </div>

        <DataTable
          head={["Business", "Status", "Plan", "WhatsApp", "Wallet", "MRR", "Messages (30d)", "Joined", "Last active"]}
          className="[&_table]:min-w-[1080px]"
          empty={rows.length === 0 ? <EmptyState icon={Building2} title="No businesses match" detail="Try clearing a filter or the search." /> : undefined}
        >
          {rows.map((b) => (
            <tr key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/admin/businesses/${b.id}`)}>
              <td className={td}>
                <div className="flex items-center gap-3">
                  <Initials name={b.name} />
                  <div className="min-w-0">
                    <Link href={`/admin/businesses/${b.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-foreground hover:underline">
                      {b.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.owner.name} · {b.city}
                    </p>
                  </div>
                  {b.flags.length > 0 && (
                    <span title={b.flags.join(", ")} className="text-rose-500">
                      <Flag className="size-3.5" />
                    </span>
                  )}
                </div>
              </td>
              <td className={td}>
                <StatusPill status={b.status} />
              </td>
              <td className={cn(td, "capitalize")}>
                {b.plan}
                <span className="block text-xs text-muted-foreground">{b.cycle}</span>
              </td>
              <td className={td}>
                <div className="flex flex-col items-start gap-1">
                  <Pill tone={NUMBER_META[b.whatsapp.status].tone}>{NUMBER_META[b.whatsapp.status].label}</Pill>
                  {b.whatsapp.status === "connected" && <span className="text-xs text-muted-foreground">Quality {QUALITY_META[b.whatsapp.quality].label.toLowerCase()}</span>}
                </div>
              </td>
              <td className={cn(td, "tabular-nums", b.wallet < 0 ? "text-rose-600" : b.wallet < 200 ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>{inr(b.wallet, 2)}</td>
              <td className={cn(td, "tabular-nums")}>{b.mrr ? inr(b.mrr) : "—"}</td>
              <td className={cn(td, "tabular-nums")}>{num(b.usage.marketing + b.usage.utility + b.usage.authentication + b.usage.service)}</td>
              <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{date(b.createdAt, true)}</td>
              <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{relTime(b.lastActiveAt)}</td>
            </tr>
          ))}
        </DataTable>
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          Showing {rows.length} of {businesses.length} businesses
        </p>
      </Panel>
    </>
  );
}
