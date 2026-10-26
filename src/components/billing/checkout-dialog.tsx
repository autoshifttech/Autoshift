"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CreditCard, Landmark, Loader2, Lock, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PLANS, planPrice, type BillingCycle, type PlanId } from "@/lib/billing/plans";
import { formatMoney } from "@/lib/wallet/model";
import { billingDetailsStore, billingErrors, taxSplit, useBillingDetails } from "@/lib/billing/gst";
import { LEGAL } from "@/lib/legal";
import { useSetup } from "@/lib/workspace/setup";
import { DetailsSummary, GstDetailsForm, TaxLines } from "./gst-details";

/**
 * Order summary before Razorpay Checkout. In production "Pay" opens
 * Razorpay's own checkout (subscription id from the backend); here it
 * simulates a successful payment.
 */
export function CheckoutDialog({
  open,
  onOpenChange,
  plan,
  cycle,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanId;
  cycle: BillingCycle;
  onPaid: () => void;
}) {
  const t = useTranslations("Billing");
  const [method, setMethod] = useState<"upi" | "card" | "netbanking">("upi");
  const [paying, setPaying] = useState(false);
  // Card → paid: the button turns into a green "Paid" tick before closing.
  const [paid, setPaid] = useState(false);
  const tg = useTranslations("Gst");
  const saved = useBillingDetails();
  const setup = useSetup();
  const [details, setDetails] = useState(() => ({ ...saved, legalName: saved.legalName || setup.business.name }));
  const savedOk = Object.keys(billingErrors(saved)).length === 0;
  const [editing, setEditing] = useState(!savedOk);
  const [tried, setTried] = useState(false);
  const valid = Object.keys(billingErrors(details)).length === 0;
  // Before a state is chosen, show the tax as if inside our own state.
  const split = taxSplit(planPrice(PLANS[plan], cycle), details.stateCode || LEGAL.sellerStateCode, LEGAL.sellerStateCode);
  const total = split.total;
  const methods = [
    { id: "upi" as const, icon: Smartphone, label: t("methodUpi") },
    { id: "card" as const, icon: CreditCard, label: t("methodCard") },
    { id: "netbanking" as const, icon: Landmark, label: t("methodNetbanking") },
  ];

  const pay = () => {
    if (!valid) {
      setTried(true);
      setEditing(true);
      return;
    }
    billingDetailsStore.set(details);
    setPaying(true);
    window.setTimeout(() => {
      setPaying(false);
      setPaid(true);
      window.setTimeout(() => {
        setPaid(false);
        onPaid();
      }, 900);
    }, 1200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("checkoutTitle")}</DialogTitle>
          <DialogDescription>{t("checkoutDesc")}</DialogDescription>
        </DialogHeader>

        <TaxLines split={split} label={`${t(`plan_${plan}`)} · ${t(cycle)}`} />

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">{tg("invoiceDetails")}</h3>
            {!editing && (
              <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-primary hover:underline">
                {tg("change")}
              </button>
            )}
          </div>
          {editing ? <GstDetailsForm value={details} onChange={setDetails} showErrors={tried} /> : <DetailsSummary d={details} />}
        </section>

        <fieldset>
          <legend className="text-sm font-medium text-foreground">{t("payWith")}</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {methods.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={method === id}
                onClick={() => setMethod(id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-colors",
                  method === id ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          {t("razorpayNote")}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={paying}>
            {t("cancel")}
          </Button>
          <Button
            onClick={pay}
            disabled={paying || paid || (tried && !valid)}
            className={cn("gap-1.5 transition-colors", paid && "bg-[#1e6b3a] text-white disabled:opacity-100")}
          >
            {paid ? (
              <span key="paid" className="pop-in inline-flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" className="draw-check size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                {t("paid")}
              </span>
            ) : (
              <>
                {paying && <Loader2 className="size-4 animate-spin" />}
                {t("payAmount", { amount: formatMoney(total) })}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
