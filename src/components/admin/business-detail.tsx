"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  Bot,
  CalendarPlus,
  Copy,
  Eye,
  Flag,
  IndianRupee,
  Mail,
  MessageSquare,
  Phone,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  StickyNote,
  Tags,
  UsersRound,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { setDemoCookie } from "@/lib/demo/cookie";
import { PLANS, type PlanId } from "@/lib/billing/plans";
import { ADMIN_NOW, INDUSTRY_LABEL, UNIT_ECONOMICS, businessById, usageRevenue, type Business, type Usage } from "@/lib/admin/data";
import { date, dateTime, daysBetween, inr, num, relTime } from "@/lib/admin/format";
import { CURRENT_ADMIN, act, applyOverride, updateBusiness, useAdmin, usePayments } from "@/lib/admin/store";
import { DataTable, EmptyState, Initials, Kpi, NUMBER_META, Panel, Pill, QualityPill, Segmented, StatusPill, td } from "./admin-ui";

type Tab = "overview" | "usage" | "payments" | "notes" | "activity";
type DialogKind = "trial" | "plan" | "credits" | "block" | null;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words text-foreground">{children}</dd>
    </div>
  );
}

function copy(text: string) {
  navigator.clipboard?.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Couldn't copy"),
  );
}

export function BusinessDetail({ id }: { id: string }) {
  const state = useAdmin();
  const payments = usePayments();
  const base = businessById(id);
  const [tab, setTab] = useState<Tab>("overview");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [note, setNote] = useState("");

  if (!base) {
    return (
      <Panel>
        <EmptyState icon={Flag} title="Business not found" detail="It may have been deleted, or the link is wrong." />
        <div className="flex justify-center">
          <Link href="/admin/businesses" className="text-sm font-medium text-primary hover:underline">
            Back to businesses
          </Link>
        </div>
      </Panel>
    );
  }

  const b: Business = applyOverride(base, state.overrides[id]);
  const notes = state.overrides[id]?.notes ?? [];
  const money = usageRevenue(b.usage);
  const mine = payments.filter((p) => p.businessId === id);
  const activity = state.audit.filter((a) => a.target === b.name);
  const blocked = b.status === "blocked";
  const trialLeft = daysBetween(b.trialEndsAt);

  const viewAs = () => {
    act("Viewed as business", b.name, "Read-only session opened");
    setDemoCookie(true);
    window.open(`/dashboard?viewAs=${encodeURIComponent(b.name)}&from=${encodeURIComponent(`/admin/businesses/${b.id}`)}`, "_blank", "noopener");
  };

  return (
    <>
      <Link href="/admin/businesses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Businesses
      </Link>

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Initials name={b.name} className="size-14 text-base" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">{b.name}</h1>
              <StatusPill status={b.status} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {INDUSTRY_LABEL[b.industry]} · {b.city} · <span className="capitalize">{b.plan}</span> plan · joined {date(b.createdAt, true)} · ID {b.id}
            </p>
            {b.flags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {b.flags.map((f) => (
                  <Pill key={f} tone="red">
                    {f}
                  </Pill>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5" onClick={viewAs}>
            <Eye className="size-4" />
            View as business
          </Button>
          {b.status === "trial" && (
            <Button variant="outline" className="gap-1.5" onClick={() => setDialog("trial")}>
              <CalendarPlus className="size-4" />
              Extend trial
            </Button>
          )}
          <Button variant="outline" className="gap-1.5" onClick={() => setDialog("plan")}>
            <Tags className="size-4" />
            Change plan
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setDialog("credits")}>
            <Wallet className="size-4" />
            Adjust credits
          </Button>
          {blocked ? (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                updateBusiness(b, "Unblocked business", "Access restored", (o) => ({ ...o, status: base.status === "blocked" ? "active" : base.status }));
                toast.success(`${b.name} is unblocked`);
              }}
            >
              <RotateCcw className="size-4" />
              Unblock
            </Button>
          ) : (
            <Button variant="outline" className="gap-1.5 text-rose-600 hover:text-rose-600" onClick={() => setDialog("block")}>
              <Ban className="size-4" />
              Block
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={IndianRupee} label="MRR" value={b.mrr ? inr(b.mrr) : "—"} hint={b.cycle === "yearly" ? "billed yearly" : "billed monthly"} />
        <Kpi icon={Wallet} tone="sky" label="Wallet" value={inr(b.wallet, 2)} hint={b.wallet < 200 ? "low balance" : "credits left"} />
        <Kpi icon={MessageSquare} tone="lilac" label="Messages, 30 days" value={num(b.usage.marketing + b.usage.utility + b.usage.authentication + b.usage.service)} />
        <Kpi icon={Bot} tone="butter" label="AI replies, 30 days" value={num(b.usage.ai)} />
        <Kpi icon={ReceiptText} tone="mint" label="Your margin, 30 days" value={inr(money.margin)} hint={`${inr(money.charged)} charged`} />
        <Kpi icon={UsersRound} tone="peach" label="Team · contacts" value={`${b.team} · ${num(b.contacts)}`} />
      </div>

      <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "overview", label: "Overview" },
            { value: "usage", label: "Usage & costs" },
            { value: "payments", label: `Payments · ${mine.length}` },
            { value: "notes", label: `Notes · ${notes.length}` },
            { value: "activity", label: "Admin activity" },
          ]}
        />
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          <Panel title="Owner">
            <dl className="divide-y divide-border">
              <Row label="Name">{b.owner.name}</Row>
              <Row label="Email">
                <button type="button" onClick={() => copy(b.owner.email)} className="inline-flex items-center gap-1.5 hover:underline">
                  <Mail className="size-3.5 text-muted-foreground" />
                  {b.owner.email}
                  <Copy className="size-3 text-muted-foreground" />
                </button>
              </Row>
              <Row label="Phone">
                <a href={`https://wa.me/${b.owner.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
                  <Phone className="size-3.5 text-muted-foreground" />
                  {b.owner.phone}
                </a>
              </Row>
              <Row label="Last active">{relTime(b.lastActiveAt)}</Row>
            </dl>
          </Panel>
          <Panel title="Subscription">
            <dl className="divide-y divide-border">
              <Row label="Plan">
                <span className="capitalize">{b.plan}</span> · {inr(PLANS[b.plan].monthly)}/month
              </Row>
              <Row label="Billing">{b.cycle === "yearly" ? "Yearly (2 months free)" : "Monthly"}</Row>
              <Row label="Status">
                <StatusPill status={b.status} />
              </Row>
              {b.status === "trial" ? (
                <Row label="Trial ends">
                  {date(b.trialEndsAt, true)} · {trialLeft > 0 ? `${trialLeft} days left` : "ended"}
                </Row>
              ) : (
                <Row label="Renews">{b.renewsAt ? date(b.renewsAt, true) : "—"}</Row>
              )}
              <Row label="Payment method">Razorpay · auto-debit</Row>
            </dl>
          </Panel>
          <Panel title="WhatsApp number">
            {b.whatsapp.status === "not_connected" ? (
              <EmptyState icon={ShieldCheck} title="WhatsApp not connected yet" detail="They signed up but never finished Embedded Signup. A quick call usually fixes this." />
            ) : (
              <dl className="divide-y divide-border">
                <Row label="Status">
                  <Pill tone={NUMBER_META[b.whatsapp.status].tone}>{NUMBER_META[b.whatsapp.status].label}</Pill>
                </Row>
                <Row label="Number">{b.whatsapp.number}</Row>
                <Row label="Display name">{b.whatsapp.displayName}</Row>
                <Row label="Quality rating">
                  <QualityPill quality={b.whatsapp.quality} />
                </Row>
                <Row label="Messaging limit">{b.whatsapp.tier} customers / 24h</Row>
                <Row label="Templates">
                  {b.whatsapp.templatesApproved} approved · {b.whatsapp.templatesRejected} rejected
                </Row>
                {b.whatsapp.connectedAt && <Row label="Connected">{date(b.whatsapp.connectedAt, true)}</Row>}
              </dl>
            )}
          </Panel>
          <Panel title="Workspace">
            <dl className="divide-y divide-border">
              <Row label="Industry">{INDUSTRY_LABEL[b.industry]}</Row>
              <Row label="City">{b.city}</Row>
              <Row label="Team members">
                {b.team} of {PLANS[b.plan].seats ?? "unlimited"}
              </Row>
              <Row label="Contacts">
                {num(b.contacts)} of {PLANS[b.plan].contacts ? num(PLANS[b.plan].contacts!) : "unlimited"}
              </Row>
              <Row label="Created">{date(b.createdAt, true)}</Row>
            </dl>
          </Panel>
        </div>
      )}

      {tab === "usage" && (
        <Panel title="Last 30 days" description="What they were charged from their wallet, what it cost you, and your margin." bodyClassName="px-0 pb-0">
          <DataTable head={["Type", "Units", "Price each", "Charged", "Your cost", "Margin"]}>
            {(Object.keys(UNIT_ECONOMICS) as (keyof Usage)[]).map((k) => {
              const e = UNIT_ECONOMICS[k];
              const units = b.usage[k];
              return (
                <tr key={k}>
                  <td className={td}>{e.label}</td>
                  <td className={cn(td, "tabular-nums")}>{num(units)}</td>
                  <td className={cn(td, "tabular-nums")}>{inr(e.price, 2)}</td>
                  <td className={cn(td, "tabular-nums")}>{inr(units * e.price)}</td>
                  <td className={cn(td, "tabular-nums")}>{inr(units * e.cost)}</td>
                  <td className={cn(td, "font-medium tabular-nums")}>{inr(units * (e.price - e.cost))}</td>
                </tr>
              );
            })}
            <tr className="bg-muted/40 font-semibold">
              <td className={td}>Total</td>
              <td className={td} />
              <td className={td} />
              <td className={cn(td, "tabular-nums")}>{inr(money.charged)}</td>
              <td className={cn(td, "tabular-nums")}>{inr(money.cost)}</td>
              <td className={cn(td, "tabular-nums")}>{inr(money.margin)}</td>
            </tr>
          </DataTable>
        </Panel>
      )}

      {tab === "payments" && (
        <Panel title="Payments" actions={<Link href={`/admin/payments?business=${b.id}`} className="text-xs font-medium text-primary hover:underline">Open in Payments</Link>} bodyClassName="px-0 pb-0">
          <DataTable head={["Date", "Type", "Amount", "GST", "Method", "Status", "Invoice"]} empty={mine.length === 0 ? <EmptyState icon={ReceiptText} title="No payments yet" /> : undefined}>
            {mine.map((p) => (
              <tr key={p.id}>
                <td className={cn(td, "whitespace-nowrap")}>{dateTime(p.at)}</td>
                <td className={cn(td, "capitalize")}>{p.kind === "topup" ? "Wallet top-up" : p.kind}</td>
                <td className={cn(td, "tabular-nums", p.amount < 0 && "text-rose-600")}>{inr(p.amount)}</td>
                <td className={cn(td, "tabular-nums text-muted-foreground")}>{inr(p.gst)}</td>
                <td className={cn(td, "uppercase text-muted-foreground text-xs")}>{p.method}</td>
                <td className={td}>
                  <Pill tone={p.status === "captured" ? "green" : p.status === "failed" ? "red" : p.status === "refunded" ? "violet" : "amber"}>{p.status === "captured" ? "Paid" : p.status[0].toUpperCase() + p.status.slice(1)}</Pill>
                </td>
                <td className={cn(td, "font-mono text-xs text-muted-foreground")}>{p.invoice ?? "—"}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {tab === "notes" && (
        <Panel title="Internal notes" description="Only your admin team sees these.">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              updateBusiness(b, "Added note", note.trim().slice(0, 80), (o) => ({ ...o, notes: [{ text: note.trim(), author: CURRENT_ADMIN.name, at: new Date().toISOString() }, ...(o.notes ?? [])] }));
              setNote("");
            }}
          >
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called the owner, will connect WhatsApp on Monday." rows={3} aria-label="New note" />
            <Button type="submit" disabled={!note.trim()} className="gap-1.5">
              <StickyNote className="size-4" />
              Add note
            </Button>
          </form>
          <ul className="mt-5 space-y-3">
            {notes.map((n, i) => (
              <li key={i} className="rounded-xl bg-[var(--tone-butter)] p-3 text-sm">
                <p className="whitespace-pre-wrap text-foreground">{n.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.author} · {dateTime(n.at)}
                </p>
              </li>
            ))}
            {notes.length === 0 && <li className="text-sm text-muted-foreground">No notes yet.</li>}
          </ul>
        </Panel>
      )}

      {tab === "activity" && (
        <Panel title="What your team did on this business" bodyClassName="px-0 pb-0">
          <DataTable head={["When", "Who", "Action", "Details"]} empty={activity.length === 0 ? <EmptyState icon={Flag} title="No admin actions yet" /> : undefined}>
            {activity.map((a) => (
              <tr key={a.id}>
                <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{dateTime(a.at)}</td>
                <td className={td}>{a.actor}</td>
                <td className={cn(td, "font-medium")}>{a.action}</td>
                <td className={cn(td, "text-muted-foreground")}>{a.details}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      )}

      <ActionDialogs kind={dialog} business={b} onClose={() => setDialog(null)} />
    </>
  );
}

function ActionDialogs({ kind, business: b, onClose }: { kind: DialogKind; business: Business; onClose: () => void }) {
  const [days, setDays] = useState("7");
  const [plan, setPlan] = useState<PlanId>(b.plan);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [reason, setReason] = useState("");
  const close = () => {
    setReason("");
    setAmount("");
    onClose();
  };
  const value = Number(amount);

  return (
    <Dialog open={kind !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        {kind === "trial" && (
          <>
            <DialogHeader>
              <DialogTitle>Extend trial</DialogTitle>
              <DialogDescription>Give {b.name} more time to try AutoShift. They get an email about it.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="trial-days">Add days</Label>
              <NativeSelect id="trial-days" value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </NativeSelect>
              <p className="text-xs text-muted-foreground">New end date: {date(new Date(Math.max(new Date(b.trialEndsAt).getTime(), ADMIN_NOW) + Number(days) * 864e5).toISOString(), true)}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const end = new Date(Math.max(new Date(b.trialEndsAt).getTime(), ADMIN_NOW) + Number(days) * 864e5).toISOString();
                  updateBusiness(b, "Extended trial", `+${days} days`, (o) => ({ ...o, trialEndsAt: end }));
                  toast.success(`Trial extended by ${days} days`);
                  close();
                }}
              >
                Extend trial
              </Button>
            </DialogFooter>
          </>
        )}
        {kind === "plan" && (
          <>
            <DialogHeader>
              <DialogTitle>Change plan</DialogTitle>
              <DialogDescription>Takes effect now. Razorpay charges or credits the difference on the next bill.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              {(["starter", "growth", "pro"] as const).map((p) => (
                <label key={p} className={cn("flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm", plan === p ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="plan" checked={plan === p} onChange={() => setPlan(p)} className="accent-[var(--primary)]" />
                    <span className="font-medium capitalize">{p}</span>
                    {b.plan === p && <span className="text-xs text-muted-foreground">(current)</span>}
                  </span>
                  <span className="tabular-nums">{inr(PLANS[p].monthly)}/mo</span>
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                disabled={plan === b.plan}
                onClick={() => {
                  updateBusiness(b, "Changed plan", `${b.plan} → ${plan}`, (o) => ({ ...o, plan }));
                  toast.success(`Moved to ${plan}`);
                  close();
                }}
              >
                Change plan
              </Button>
            </DialogFooter>
          </>
        )}
        {kind === "credits" && (
          <>
            <DialogHeader>
              <DialogTitle>Adjust wallet credits</DialogTitle>
              <DialogDescription>Current balance {inr(b.wallet, 2)}. Use this for goodwill credits or to correct a charge.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Segmented value={direction} onChange={setDirection} options={[{ value: "add", label: "Add credits" }, { value: "remove", label: "Remove credits" }]} />
              <div className="space-y-2">
                <Label htmlFor="credit-amount">Amount (₹)</Label>
                <Input id="credit-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="500" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="credit-reason">Reason (shown in their wallet)</Label>
                <Input id="credit-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sorry for the delayed messages on 12 Oct" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                disabled={!value || !reason.trim()}
                onClick={() => {
                  const delta = direction === "add" ? value : -value;
                  updateBusiness(b, direction === "add" ? "Added credits" : "Removed credits", `${inr(Math.abs(delta), 2)} · ${reason.trim()}`, (o) => ({ ...o, walletAdjust: (o.walletAdjust ?? 0) + delta }));
                  toast.success(`${direction === "add" ? "Added" : "Removed"} ${inr(value, 2)}`);
                  close();
                }}
              >
                {direction === "add" ? "Add credits" : "Remove credits"}
              </Button>
            </DialogFooter>
          </>
        )}
        {kind === "block" && (
          <>
            <DialogHeader>
              <DialogTitle>Block {b.name}?</DialogTitle>
              <DialogDescription>Their team can&apos;t sign in, and AutoShift stops sending messages for them. Their data is kept and you can unblock any time.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="block-reason">Reason (kept in the audit log)</Label>
              <Textarea id="block-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Spam complaints from customers" rows={3} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!reason.trim()}
                onClick={() => {
                  updateBusiness(b, "Blocked business", reason.trim(), (o) => ({ ...o, status: "blocked" }));
                  toast.success(`${b.name} is blocked`);
                  close();
                }}
              >
                Block business
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
