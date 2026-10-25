"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Save, TicketPercent } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ADMIN_NOW, UNIT_ECONOMICS, type Usage } from "@/lib/admin/data";
import { date, inr, num, pct } from "@/lib/admin/format";
import { act, useAdmin, useBusinesses, type Coupon, type PlanConfig } from "@/lib/admin/store";
import { DataTable, EmptyState, PageHeader, Panel, Pill, td } from "./admin-ui";

const limit = (v: number | null) => (v === null ? "" : String(v));
const parseLimit = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v.replace(/\D/g, "")) || 0));

function PlanCard({ plan, subscribers }: { plan: PlanConfig; subscribers: number }) {
  const [draft, setDraft] = useState(plan);
  const dirty = JSON.stringify(draft) !== JSON.stringify(plan);
  const field = (key: keyof PlanConfig, label: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${plan.id}-${key}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={`${plan.id}-${key}`}
        inputMode="numeric"
        value={key === "seats" || key === "contacts" ? limit(draft[key] as number | null) : String(draft[key])}
        placeholder={hint}
        onChange={(e) => setDraft({ ...draft, [key]: key === "seats" || key === "contacts" ? parseLimit(e.target.value) : Number(e.target.value.replace(/\D/g, "")) || 0 })}
      />
    </div>
  );
  return (
    <div className={cn("flex flex-col rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)]", draft.active ? "border-border" : "border-dashed border-border opacity-80")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Plan name" className="h-8 border-transparent bg-transparent px-0 text-lg font-bold shadow-none focus-visible:border-border focus-visible:px-2" />
          <p className="text-xs text-muted-foreground">
            {subscribers} paying · {inr(draft.monthly * 10)} yearly (2 months free)
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
          {draft.active ? "On sale" : "Hidden"}
          <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} aria-label={`${plan.name} on sale`} />
        </label>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {field("monthly", "Price per month (₹)")}
        {field("aiReplies", "AI replies included")}
        {field("seats", "Team members", "Unlimited")}
        {field("contacts", "Contacts", "Unlimited")}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Price changes apply to new signups now and to existing businesses from their next renewal. Empty limit = unlimited.</p>
      <div className="mt-4 flex justify-end gap-2">
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(plan)}>
            Undo
          </Button>
        )}
        <Button
          disabled={!dirty || !draft.name.trim() || draft.monthly <= 0}
          className="gap-1.5"
          onClick={() => {
            const changes = (Object.keys(draft) as (keyof PlanConfig)[]).filter((k) => draft[k] !== plan[k]).map((k) => (k === "monthly" ? `price ${inr(plan.monthly)} → ${inr(draft.monthly)}` : `${k} ${String(plan[k] ?? "∞")} → ${String(draft[k] ?? "∞")}`));
            act("Changed plan", `${plan.name} plan`, changes.join(", "), (s) => ({ plans: s.plans.map((p) => (p.id === plan.id ? draft : p)) }));
            toast.success(`${draft.name} plan saved`);
          }}
        >
          <Save className="size-4" />
          Save
        </Button>
      </div>
    </div>
  );
}

function RatesPanel() {
  const { prices } = useAdmin();
  const [draft, setDraft] = useState<Record<keyof Usage, string>>(() => Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, String(v)])) as Record<keyof Usage, string>);
  const kinds = (Object.keys(UNIT_ECONOMICS) as (keyof Usage)[]).filter((k) => k !== "service");
  const dirty = kinds.some((k) => Number(draft[k]) !== prices[k]);
  const invalid = kinds.some((k) => !(Number(draft[k]) >= 0));
  return (
    <Panel
      title="Message and AI prices"
      description="What businesses pay from their wallet per message or AI reply. Meta's cost is shown so you never sell below it. Service conversations are free on Meta's side."
      actions={
        <Button
          disabled={!dirty || invalid}
          className="gap-1.5"
          onClick={() => {
            const next = { ...prices, ...Object.fromEntries(kinds.map((k) => [k, Number(draft[k])])) } as Record<keyof Usage, number>;
            act("Changed prices", "Wallet rates", kinds.filter((k) => next[k] !== prices[k]).map((k) => `${UNIT_ECONOMICS[k].label} ${inr(prices[k], 2)} → ${inr(next[k], 2)}`).join(", "), () => ({ prices: next }));
            toast.success("Prices saved");
          }}
        >
          <Save className="size-4" />
          Save prices
        </Button>
      }
      bodyClassName="px-0 pb-0"
    >
      <div id="rates" />
      <DataTable head={["Type", "Your cost", "Price to businesses", "Margin each", "Margin %"]}>
        {kinds.map((k) => {
          const price = Number(draft[k]) || 0;
          const cost = UNIT_ECONOMICS[k].cost;
          const below = price < cost;
          return (
            <tr key={k}>
              <td className={cn(td, "font-medium")}>{UNIT_ECONOMICS[k].label}</td>
              <td className={cn(td, "tabular-nums text-muted-foreground")}>{inr(cost, 2)}</td>
              <td className={td}>
                <div className="relative w-32">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                  <Input inputMode="decimal" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value.replace(/[^\d.]/g, "") })} aria-label={`${UNIT_ECONOMICS[k].label} price`} className={cn("h-8 pl-7", below && "border-rose-500")} />
                </div>
              </td>
              <td className={cn(td, "tabular-nums", below ? "text-rose-600" : "text-foreground")}>{inr(price - cost, 2)}</td>
              <td className={cn(td, "tabular-nums")}>{price ? pct((price - cost) / price) : "—"}</td>
            </tr>
          );
        })}
      </DataTable>
      {kinds.some((k) => (Number(draft[k]) || 0) < UNIT_ECONOMICS[k].cost) && <p className="px-5 py-3 text-xs text-rose-600">A price is below your cost. You would lose money on every message of that type.</p>}
    </Panel>
  );
}

function TrialWalletPanel() {
  const { trialDays, minTopup } = useAdmin();
  const [trial, setTrial] = useState(String(trialDays));
  const [topup, setTopup] = useState(String(minTopup));
  const dirty = Number(trial) !== trialDays || Number(topup) !== minTopup;
  return (
    <Panel title="Trial and wallet">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="trial-days">Free trial length (days)</Label>
          <Input id="trial-days" inputMode="numeric" value={trial} onChange={(e) => setTrial(e.target.value.replace(/\D/g, ""))} />
          <p className="text-xs text-muted-foreground">For new signups. Existing trials keep their end date.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="min-topup">Minimum top-up (₹)</Label>
          <Input id="min-topup" inputMode="numeric" value={topup} onChange={(e) => setTopup(e.target.value.replace(/\D/g, ""))} />
          <p className="text-xs text-muted-foreground">Smallest amount a business can add to its wallet.</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          disabled={!dirty || !Number(trial) || !Number(topup)}
          className="gap-1.5"
          onClick={() => {
            act("Changed settings", "Trial and wallet", `trial ${trialDays} → ${trial} days, minimum top-up ${inr(minTopup)} → ${inr(Number(topup))}`, () => ({ trialDays: Number(trial), minTopup: Number(topup) }));
            toast.success("Saved");
          }}
        >
          <Save className="size-4" />
          Save
        </Button>
      </div>
    </Panel>
  );
}

function CouponsPanel() {
  const { coupons, plans } = useAdmin();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("10");
  const [appliesTo, setAppliesTo] = useState<Coupon["appliesTo"]>("all");
  const [days, setDays] = useState("30");
  const [max, setMax] = useState("");
  const exists = coupons.some((c) => c.code === code.trim().toUpperCase());
  const toggle = (c: Coupon) => act(c.active ? "Paused coupon" : "Resumed coupon", c.code, `${c.percentOff}% off`, (s) => ({ coupons: s.coupons.map((x) => (x.code === c.code ? { ...x, active: !x.active } : x)) }));

  return (
    <Panel
      title="Coupons"
      description="Discounts businesses enter at checkout."
      actions={
        <Button variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          New coupon
        </Button>
      }
      bodyClassName="px-0 pb-0"
    >
      <DataTable head={["Code", "Discount", "Applies to", "Used", "Expires", "Status", ""]} empty={coupons.length === 0 ? <EmptyState icon={TicketPercent} title="No coupons yet" /> : undefined}>
        {coupons.map((c) => {
          const expired = new Date(c.expiresAt).getTime() < ADMIN_NOW;
          return (
            <tr key={c.code}>
              <td className={cn(td, "font-mono font-semibold")}>{c.code}</td>
              <td className={cn(td, "tabular-nums")}>{c.percentOff}% off</td>
              <td className={cn(td, "capitalize")}>{c.appliesTo === "all" ? "All plans" : `${c.appliesTo} plan`}</td>
              <td className={cn(td, "tabular-nums")}>
                {num(c.redemptions)}
                {c.maxRedemptions ? ` / ${num(c.maxRedemptions)}` : ""}
              </td>
              <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{date(c.expiresAt, true)}</td>
              <td className={td}>{expired ? <Pill tone="gray">Expired</Pill> : c.active ? <Pill tone="green">Active</Pill> : <Pill tone="amber">Paused</Pill>}</td>
              <td className={cn(td, "text-right")}>{!expired && <Switch checked={c.active} onCheckedChange={() => toggle(c)} aria-label={`${c.code} active`} />}</td>
            </tr>
          );
        })}
      </DataTable>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New coupon</DialogTitle>
            <DialogDescription>Businesses type the code at checkout. The discount applies to their first bill.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="coupon-code">Code</Label>
              <Input id="coupon-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16))} placeholder="WELCOME15" className="font-mono" />
              {exists && <p className="text-xs text-rose-600">That code already exists.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-pct">Discount %</Label>
                <Input id="coupon-pct" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value.replace(/\D/g, "").slice(0, 2))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-plan">Applies to</Label>
                <NativeSelect id="coupon-plan" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as Coupon["appliesTo"])}>
                  <option value="all">All plans</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-days">Valid for (days)</Label>
                <Input id="coupon-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-max">Max uses</Label>
                <Input id="coupon-max" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} placeholder="No limit" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={code.length < 3 || exists || !Number(percent) || !Number(days)}
              onClick={() => {
                const coupon: Coupon = { code, percentOff: Number(percent), appliesTo, expiresAt: new Date(ADMIN_NOW + Number(days) * 864e5).toISOString(), redemptions: 0, maxRedemptions: max ? Number(max) : null, active: true };
                act("Created coupon", code, `${percent}% off ${appliesTo === "all" ? "all plans" : appliesTo}`, (s) => ({ coupons: [coupon, ...s.coupons] }));
                toast.success(`Coupon ${code} created`);
                setCode("");
                setMax("");
                setOpen(false);
              }}
            >
              Create coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

export function PlansPage() {
  const { plans, prices, trialDays, minTopup } = useAdmin();
  const businesses = useBusinesses();
  const paying = (id: string) => businesses.filter((b) => b.plan === id && (b.status === "active" || b.status === "past_due")).length;
  return (
    <>
      <PageHeader title="Plans & pricing" description="Plan prices and limits, wallet rates, trial length and coupons. Every change is logged in the audit log." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={`${p.id}-${JSON.stringify(p)}`} plan={p} subscribers={paying(p.id)} />
        ))}
      </div>
      <RatesPanel key={JSON.stringify(prices)} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <TrialWalletPanel key={`${trialDays}-${minTopup}`} />
        <CouponsPanel />
      </div>
    </>
  );
}
