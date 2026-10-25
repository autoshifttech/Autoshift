"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, FileText, Pencil, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SettingsPanelHead } from "@/components/settings/settings-panel-head";
import { CycleToggle, PlanPicker } from "@/components/billing/plan-picker";
import { CheckoutDialog } from "@/components/billing/checkout-dialog";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { DetailsSummary, GstDetailsForm } from "@/components/billing/gst-details";
import { GstInvoiceDialog, type InvoiceRow } from "@/components/billing/gst-invoice-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { billingDetailsStore, billingErrors, useBillingDetails, type BillingDetails } from "@/lib/billing/gst";
import { cn } from "@/lib/utils";
import {
  PLANS,
  PLAN_IDS,
  SAMPLE_INVOICES,
  SAMPLE_USAGE,
  formatInr,
  planPrice,
  subscriptionStore,
  trialDaysLeft,
  useSubscription,
  type BillingCycle,
  type PlanId,
} from "@/lib/billing/plans";

/** Settings → Plan & billing. Sample usage and invoices until billing is wired to Razorpay. */
export function BillingPanel() {
  const t = useTranslations("Billing");
  const sub = useSubscription();
  const plan = PLANS[sub.plan];
  const [cycle, setCycle] = useState<BillingCycle>(sub.cycle);
  const [checkout, setCheckout] = useState<PlanId | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const daysLeft = trialDaysLeft(sub);
  const tg = useTranslations("Gst");
  const details = useBillingDetails();
  const [editDetails, setEditDetails] = useState<BillingDetails | null>(null);
  const [triedSave, setTriedSave] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const hasDetails = Object.keys(billingErrors(details)).length === 0;

  const meters = [
    { key: "seats", used: SAMPLE_USAGE.seats, max: plan.seats },
    { key: "contacts", used: SAMPLE_USAGE.contacts, max: plan.contacts },
    { key: "aiReplies", used: SAMPLE_USAGE.aiReplies, max: plan.aiReplies },
    { key: "bookingStaff", used: SAMPLE_USAGE.bookingStaff, max: plan.bookingStaff },
  ] as const;

  const actionLabel = (id: PlanId) => {
    if (sub.status === "trialing") return t("choosePlan", { plan: t(`plan_${id}`) });
    return PLAN_IDS.indexOf(id) > PLAN_IDS.indexOf(sub.plan) ? t("upgradeTo", { plan: t(`plan_${id}`) }) : t("downgradeTo", { plan: t(`plan_${id}`) });
  };

  return (
    <div className="space-y-8">
      <SettingsPanelHead title={t("title")} description={t("description")} />

      {/* Current plan */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("currentPlan")}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {t(`plan_${sub.plan}`)}{" "}
              <span className="text-base font-normal text-muted-foreground">
                · {formatInr(planPrice(plan, sub.cycle))} / {t(sub.cycle === "monthly" ? "month" : "year")}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {sub.status === "trialing" && t("trialStatus", { days: daysLeft })}
              {sub.status === "active" && sub.renewsAt && t("renewsOn", { date: new Date(sub.renewsAt).toLocaleDateString() })}
              {sub.status === "cancelled" && t("cancelledStatus")}
            </p>
          </div>
          <span
            className={cn(
              "w-fit rounded-full px-2.5 py-1 text-xs font-medium",
              sub.status === "trialing" && "bg-[var(--tone-butter)] text-[#7A5A0E] dark:text-amber-300",
              sub.status === "active" && "bg-[var(--tone-mint)] text-primary",
              sub.status === "cancelled" && "bg-muted text-muted-foreground",
            )}
          >
            {t(`status_${sub.status}`)}
          </span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {meters.map(({ key, used, max }) => {
            const pct = max === null ? 0 : Math.min(100, Math.round((used / max) * 100));
            return (
              <div key={key}>
                <div className="flex justify-between text-sm">
                  <span className="text-foreground">{t(`usage_${key}`)}</span>
                  <span className="text-muted-foreground">
                    {used.toLocaleString()} / {max === null ? t("unlimited") : max.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", pct >= 85 ? "bg-amber-500" : "bg-primary")}
                    style={{ width: `${max === null ? 8 : pct}%` }}
                  />
                </div>
                {pct >= 85 && (
                  <button type="button" onClick={() => setUpgradeOpen(true)} className="mt-1 text-xs text-amber-700 hover:underline dark:text-amber-300">
                    {t("nearLimit")}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
          {sub.status === "trialing" && <Button onClick={() => setCheckout(sub.plan)}>{t("subscribeNow")}</Button>}
          {sub.status === "active" && (
            <Button
              variant="outline"
              onClick={() => {
                subscriptionStore.set((s) => ({ ...s, status: "cancelled" }));
                toast.success(t("cancelledToast"));
              }}
            >
              {t("cancelSubscription")}
            </Button>
          )}
          {sub.status === "cancelled" && <Button onClick={() => setCheckout(sub.plan)}>{t("resume")}</Button>}
        </div>
      </div>

      {/* Change plan */}
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-foreground">{t("changePlan")}</h3>
          <CycleToggle cycle={cycle} onChange={setCycle} />
        </div>
        <PlanPicker
          cycle={cycle}
          current={sub.status === "active" && sub.cycle === cycle ? sub.plan : undefined}
          onSelect={(id) => setCheckout(id)}
          actionLabel={actionLabel}
        />
      </section>

      {/* GST invoice details */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <FileText className="size-4 text-primary" />
              {tg("invoiceDetails")}
            </h3>
            <p className="text-sm text-muted-foreground">{tg("invoiceDetailsDesc")}</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditDetails(details)}>
            <Pencil className="size-3.5" />
            {hasDetails ? tg("edit") : tg("add")}
          </Button>
        </div>
        {hasDetails ? <DetailsSummary d={details} /> : <p className="rounded-xl bg-[var(--tone-butter)] p-3 text-sm text-foreground">{tg("missingDetails")}</p>}
      </section>

      {/* Invoices */}
      <section>
        <h3 className="mb-3 text-base font-semibold text-foreground">{t("invoices")}</h3>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {SAMPLE_INVOICES.map((inv, i) => (
            <div key={inv.id} className={cn("flex items-center gap-3 px-4 py-3 text-sm", i > 0 && "border-t border-border")}>
              <Receipt className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{inv.id}</span>
              <span className="hidden text-muted-foreground sm:inline">{new Date(inv.date).toLocaleDateString()}</span>
              <span className="text-foreground">{formatInr(inv.amount)}</span>
              <span className="rounded-full bg-[var(--tone-mint)] px-2 py-0.5 text-xs text-primary">{t("paid")}</span>
              <Button variant="ghost" size="icon-sm" aria-label={t("downloadInvoice")} onClick={() => setInvoice({ id: inv.id, date: inv.date, amount: inv.amount, item: tg("planItem", { plan: inv.amount >= 2499 ? t("plan_growth") : t("plan_starter") }) })}>
                <Download className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      {checkout && (
        <CheckoutDialog
          open
          onOpenChange={(open) => !open && setCheckout(null)}
          plan={checkout}
          cycle={cycle}
          onPaid={() => {
            const renews = new Date();
            if (cycle === "monthly") renews.setMonth(renews.getMonth() + 1);
            else renews.setFullYear(renews.getFullYear() + 1);
            subscriptionStore.set({ plan: checkout, cycle, status: "active", trialEndsAt: new Date().toISOString(), renewsAt: renews.toISOString() });
            setCheckout(null);
            toast.success(t("paidToast", { plan: t(`plan_${checkout}`) }));
          }}
        />
      )}
      <GstInvoiceDialog invoice={invoice} details={details} onClose={() => setInvoice(null)} />
      <Dialog open={!!editDetails} onOpenChange={(o) => !o && (setEditDetails(null), setTriedSave(false))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tg("invoiceDetails")}</DialogTitle>
            <DialogDescription>{tg("invoiceDetailsDesc")}</DialogDescription>
          </DialogHeader>
          {editDetails && <GstDetailsForm value={editDetails} onChange={setEditDetails} showErrors={triedSave} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDetails(null)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={() => {
                if (!editDetails) return;
                if (Object.keys(billingErrors(editDetails)).length) return setTriedSave(true);
                billingDetailsStore.set(editDetails);
                setEditDetails(null);
                setTriedSave(false);
                toast.success(tg("saved"));
              }}
            >
              {tg("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} limitKey="aiReplies" onUpgrade={() => setCheckout("pro")} />
    </div>
  );
}
