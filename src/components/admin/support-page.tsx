"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Inbox, Lock, MessageSquareReply, Search, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { businessById, type Ticket, type TicketPriority, type TicketStatus } from "@/lib/admin/data";
import { dateTime, relTime } from "@/lib/admin/format";
import { CURRENT_ADMIN, addTicketMessage, act, updateTicket, useAdmin } from "@/lib/admin/store";
import { EmptyState, Initials, PRIORITY_META, PageHeader, Pill, Segmented, TICKET_STATUS_META } from "./admin-ui";

const CANNED: { label: string; text: string }[] = [
  { label: "Connect WhatsApp", text: "Open Settings → WhatsApp → Connect, sign in with the Facebook account that manages your business, then pick or add your number. If the popup closes early, allow popups for this site and try again. Happy to do it with you on a quick call." },
  { label: "Template rejected", text: "Meta rejected the template because of how it is worded. Remove offers from Utility templates, add sample values for every {{variable}}, and avoid starting or ending with a variable. Resubmit and it usually clears within an hour." },
  { label: "Payment pending", text: "UPI payments can take up to 30 minutes to confirm. If it still shows pending after that, reply here with the UPI reference and we will add the credits by hand." },
  { label: "Closing note", text: "Glad that's sorted! I'll close this for now. Just reply if anything comes up again." },
];

const PRIORITY_ORDER: Record<TicketPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function TicketRow({ t, active, onOpen }: { t: Ticket; active: boolean; onOpen: () => void }) {
  const b = businessById(t.businessId);
  const last = t.messages[t.messages.length - 1];
  const waiting = last?.from === "business" && t.status !== "closed";
  return (
    <button type="button" onClick={onOpen} className={cn("flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors", active ? "bg-primary/8" : "hover:bg-muted/60")}>
      <Initials name={b?.name ?? "?"} className="size-9" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{b?.name}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{relTime(last?.at ?? t.createdAt)}</span>
        </span>
        <span className="block truncate text-sm text-foreground">{t.subject}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <Pill tone={PRIORITY_META[t.priority].tone}>{PRIORITY_META[t.priority].label}</Pill>
          <span className="text-xs text-muted-foreground">
            {t.id} · {t.assignee ?? "Unassigned"}
          </span>
          {waiting && <span className="size-2 rounded-full bg-primary" aria-label="Waiting for your reply" />}
        </span>
      </span>
    </button>
  );
}

function Conversation({ t, team, onBack }: { t: Ticket; team: string[]; onBack: () => void }) {
  const b = businessById(t.businessId);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [t.messages.length, t.id]);

  const send = (close: boolean) => {
    if (!text.trim()) return;
    addTicketMessage(t.id, { from: mode === "note" ? "note" : "admin", author: CURRENT_ADMIN.name, text: text.trim(), at: new Date().toISOString() }, close ? "closed" : mode === "reply" ? "pending" : undefined);
    act(mode === "note" ? "Added ticket note" : close ? "Replied and closed ticket" : "Replied to ticket", t.id, text.trim().slice(0, 80));
    if (!t.assignee) updateTicket(t.id, { assignee: CURRENT_ADMIN.name });
    setText("");
    toast.success(mode === "note" ? "Note added" : close ? "Reply sent and ticket closed" : "Reply sent on WhatsApp and email");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border p-4">
        <div className="flex items-start gap-2">
          <button type="button" onClick={onBack} aria-label="Back to tickets" className="-ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted lg:hidden">
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {t.id} · {t.category} · opened {dateTime(t.createdAt)}
            </p>
            <h2 className="text-lg font-semibold text-foreground">{t.subject}</h2>
            {b && (
              <Link href={`/admin/businesses/${b.id}`} className="text-sm text-primary hover:underline">
                {b.name} · {b.owner.name}
              </Link>
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <NativeSelect size="sm" aria-label="Status" value={t.status} onChange={(e) => updateTicket(t.id, { status: e.target.value as TicketStatus }, { action: "Changed ticket status", details: TICKET_STATUS_META[e.target.value as TicketStatus].label })}>
            {(Object.keys(TICKET_STATUS_META) as TicketStatus[]).map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_META[s].label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect size="sm" aria-label="Priority" value={t.priority} onChange={(e) => updateTicket(t.id, { priority: e.target.value as TicketPriority }, { action: "Changed ticket priority", details: e.target.value })}>
            {(Object.keys(PRIORITY_META) as TicketPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect size="sm" aria-label="Assignee" value={t.assignee ?? ""} onChange={(e) => updateTicket(t.id, { assignee: e.target.value || null }, { action: "Assigned ticket", details: e.target.value || "Unassigned" })}>
            <option value="">Unassigned</option>
            {team.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/30 p-4">
        {t.messages.map((m, i) => (
          <div key={i} className={cn("flex", m.from === "business" ? "justify-start" : "justify-end")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                m.from === "business" && "rounded-tl-sm bg-card text-foreground",
                m.from === "admin" && "rounded-tr-sm bg-primary text-primary-foreground",
                m.from === "note" && "rounded-tr-sm border border-amber-500/30 bg-[var(--tone-butter)] text-foreground",
              )}
            >
              {m.from === "note" && (
                <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                  <Lock className="size-3" /> Internal note
                </span>
              )}
              <p className="whitespace-pre-wrap">{m.text}</p>
              <p className={cn("mt-1 text-xs", m.from === "admin" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {m.author} · {dateTime(m.at)}
              </p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>

      <div className="border-t border-border p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Segmented value={mode} onChange={setMode} options={[{ value: "reply", label: "Reply" }, { value: "note", label: "Internal note" }]} />
          <NativeSelect size="sm" aria-label="Saved replies" value="" onChange={(e) => e.target.value && setText(e.target.value)} className="w-44">
            <option value="">Saved replies…</option>
            {CANNED.map((c) => (
              <option key={c.label} value={c.text}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={mode === "note" ? "Only your admin team sees this…" : `Reply to ${b?.owner.name ?? "the business"}. They get it on WhatsApp and email.`}
          aria-label={mode === "note" ? "Internal note" : "Reply"}
          className={cn(mode === "note" && "border-amber-500/40 bg-[var(--tone-butter)]")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(false);
          }}
        />
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {mode === "reply" && t.status !== "closed" && (
            <Button variant="outline" disabled={!text.trim()} onClick={() => send(true)}>
              Send and close
            </Button>
          )}
          <Button disabled={!text.trim()} onClick={() => send(false)} className="gap-1.5">
            {mode === "note" ? <Lock className="size-4" /> : <Send className="size-4" />}
            {mode === "note" ? "Add note" : "Send reply"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SupportPage() {
  const { tickets, team } = useAdmin();
  const [status, setStatus] = useState<TicketStatus | "all">("open");
  const [who, setWho] = useState<"all" | "mine" | "unassigned">("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const list = tickets
    .filter((t) => status === "all" || t.status === status)
    .filter((t) => who === "all" || (who === "mine" ? t.assignee === CURRENT_ADMIN.name : !t.assignee))
    .filter((t) => !q || `${t.subject} ${t.id} ${businessById(t.businessId)?.name} ${t.messages.map((m) => m.text).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.createdAt.localeCompare(a.createdAt));
  const counts = (s: TicketStatus) => tickets.filter((t) => t.status === s).length;
  const selected = tickets.find((t) => t.id === openId);
  const names = [CURRENT_ADMIN.name, ...team.filter((m) => m.role === "support" && m.status === "active").map((m) => m.name)];

  return (
    <>
      <PageHeader title="Support inbox" description="Requests businesses send from the help button. Replies reach the owner on WhatsApp and email." />
      <div className="grid h-[calc(100dvh-13.5rem)] min-h-[520px] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className={cn("flex min-h-0 flex-col border-border lg:border-r", selected && "hidden lg:flex")}>
          <div className="space-y-2 border-b border-border p-3">
            <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Segmented
                value={status}
                onChange={setStatus}
                options={[
                  { value: "open", label: `Open · ${counts("open")}` },
                  { value: "pending", label: `Waiting · ${counts("pending")}` },
                  { value: "closed", label: `Closed · ${counts("closed")}` },
                  { value: "all", label: "All" },
                ]}
              />
            </div>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-9 pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tickets" aria-label="Search tickets" />
              </div>
              <NativeSelect size="sm" aria-label="Assigned to" value={who} onChange={(e) => setWho(e.target.value as typeof who)} className="w-32">
                <option value="all">Everyone</option>
                <option value="mine">Mine</option>
                <option value="unassigned">Unassigned</option>
              </NativeSelect>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.map((t) => (
              <TicketRow key={t.id} t={t} active={t.id === openId} onOpen={() => setOpenId(t.id)} />
            ))}
            {list.length === 0 && <EmptyState icon={Inbox} title="No tickets here" detail="Inbox zero. Enjoy it." />}
          </div>
        </div>
        <div className={cn("min-h-0", !selected && "hidden lg:block")}>
          {selected ? (
            <Conversation key={selected.id} t={selected} team={names} onBack={() => setOpenId(null)} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <EmptyState icon={MessageSquareReply} title="Pick a ticket" detail="Open a request on the left to read and reply." />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
