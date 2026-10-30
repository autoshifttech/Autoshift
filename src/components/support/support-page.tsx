"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Clock, LifeBuoy, MessageCircle, Plus, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { DEMO_BUSINESS_ID, type Ticket } from "@/lib/admin/data";
// Requests go to the platform team's Support inbox (/admin/support). Until
// the backend exists both sides share this browser's store.
import { CURRENT_ADMIN, addTicketMessage, createTicket, useAdmin } from "@/lib/admin/store";

const CATEGORIES: Ticket["category"][] = ["WhatsApp connection", "Billing", "Templates", "AI assistant", "Bug", "Other"];
const CATEGORY_KEY: Record<Ticket["category"], string> = { "WhatsApp connection": "whatsapp", Billing: "billing", Templates: "templates", "AI assistant": "ai", Bug: "bug", Other: "other" };
const URGENCY: Ticket["priority"][] = ["normal", "high", "urgent"];

function StatusPill({ status }: { status: Ticket["status"] }) {
  const t = useTranslations("Support");
  const tone = status === "open" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : status === "pending" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground";
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tone)}>{t(`status_${status}`)}</span>;
}

function Thread({ ticket, onBack }: { ticket: Ticket; onBack: () => void }) {
  const t = useTranslations("Support");
  const locale = useLocale();
  const { profile } = useAuth();
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  // Internal notes stay with the AutoShift team.
  const messages = ticket.messages.filter((m) => m.from !== "note");
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b border-border p-4">
        <button type="button" onClick={onBack} aria-label={t("back")} className="-ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted lg:hidden">
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {ticket.id} · {t(`category_${CATEGORY_KEY[ticket.category]}`)} · {when(ticket.createdAt)}
          </p>
          <h2 className="font-semibold text-foreground">{ticket.subject}</h2>
        </div>
        <StatusPill status={ticket.status} />
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/30 p-4">
        {messages.map((m, i) => {
          const mine = m.from === "business";
          return (
            <div key={i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm", mine ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-card text-foreground")}>
                {!mine && <p className="mb-0.5 text-xs font-semibold text-primary">{m.author === CURRENT_ADMIN.name ? t("teamFallback") : t("teamName", { name: m.author })}</p>}
                <p className="whitespace-pre-wrap">{m.text}</p>
                <p className={cn("mt-1 text-xs", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{when(m.at)}</p>
              </div>
            </div>
          );
        })}
        {ticket.status === "open" && messages[messages.length - 1]?.from === "business" && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> {t("waitingForTeam")}
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        className="border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          addTicketMessage(ticket.id, { from: "business", author: profile?.full_name || t("you"), text: text.trim(), at: new Date().toISOString() }, "open");
          setText("");
          toast.success(t("replySent"));
        }}
      >
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={ticket.status === "closed" ? t("reopenPlaceholder") : t("replyPlaceholder")} aria-label={t("replyPlaceholder")} />
        <div className="mt-2 flex justify-end">
          <Button type="submit" disabled={!text.trim()} className="gap-1.5">
            <Send className="size-4" />
            {ticket.status === "closed" ? t("reopen") : t("send")}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function SupportPage() {
  const t = useTranslations("Support");
  const locale = useLocale();
  const params = useSearchParams();
  const { profile } = useAuth();
  const { tickets } = useAdmin();
  const mine = tickets.filter((x) => x.businessId === DEMO_BUSINESS_ID).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [form, setForm] = useState({ category: "" as Ticket["category"] | "", subject: "", message: "", priority: "normal" as Ticket["priority"] });
  const selected = mine.find((x) => x.id === openId);
  const lastAt = (x: Ticket) => x.messages[x.messages.length - 1]?.at ?? x.createdAt;
  const unreadReply = (x: Ticket) => x.status === "pending";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="sr-only">{t("title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button className="gap-1.5 self-start" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {t("newRequest")}
        </Button>
      </div>

      {mine.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <LifeBuoy className="size-8 text-primary" />
          <p className="mt-3 font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("emptyDesc")}</p>
          <Button className="mt-4" onClick={() => setCreating(true)}>
            {t("newRequest")}
          </Button>
        </div>
      ) : (
        <div className="grid h-[calc(100dvh-16rem)] min-h-[480px] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] lg:grid-cols-[340px_minmax(0,1fr)]">
          <ul className={cn("min-h-0 overflow-y-auto border-border lg:border-r", selected && "hidden lg:block")}>
            {mine.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => setOpenId(x.id)} className={cn("w-full border-b border-border px-4 py-3 text-left transition-colors", x.id === openId ? "bg-primary/8" : "hover:bg-muted/60")}>
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{x.subject}</span>
                    {unreadReply(x) && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label={t("newReply")} />}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <StatusPill status={x.status} />
                    <span className="truncate text-xs text-muted-foreground">
                      {x.id} · {new Date(lastAt(x)).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className={cn("min-h-0", !selected && "hidden lg:block")}>
            {selected ? (
              <Thread key={selected.id} ticket={selected} onBack={() => setOpenId(null)} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <MessageCircle className="size-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">{t("pick")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("newRequest")}</DialogTitle>
            <DialogDescription>{t("newRequestDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sr-cat">{t("category")}</Label>
                <NativeSelect id="sr-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Ticket["category"] })}>
                  <option value="">{t("categoryPlaceholder")}</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`category_${CATEGORY_KEY[c]}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sr-pri">{t("urgency")}</Label>
                <NativeSelect id="sr-pri" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Ticket["priority"] })}>
                  {URGENCY.map((p) => (
                    <option key={p} value={p}>
                      {t(`urgency_${p}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sr-subject">{t("subject")}</Label>
              <Input id="sr-subject" value={form.subject} maxLength={120} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder={t("subjectPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sr-message">{t("message")}</Label>
              <Textarea id="sr-message" rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder={t("messagePlaceholder")} />
            </div>
            <p className="text-xs text-muted-foreground">{t("replyTime")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              {t("cancel")}
            </Button>
            <Button
              disabled={!form.category || !form.subject.trim() || form.message.trim().length < 10}
              onClick={() => {
                const id = createTicket({ businessId: DEMO_BUSINESS_ID, category: form.category as Ticket["category"], subject: form.subject.trim(), message: form.message.trim(), priority: form.priority, author: profile?.full_name || t("you") });
                setCreating(false);
                setForm({ category: "", subject: "", message: "", priority: "normal" });
                setOpenId(id);
                toast.success(t("created", { id }));
              }}
            >
              {t("sendRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
