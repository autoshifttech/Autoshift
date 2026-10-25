"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CreditCard, Landmark, Loader2, Lock, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PLANS, formatInr, planPrice, withGst, type BillingCycle, type PlanId } from "@/lib/billing/plans";

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
  const { subtotal, gst, total } = withGst(planPrice(PLANS[plan], cycle));
  const methods = [
    { id: "upi" as const, icon: Smartphone, label: t("methodUpi") },
    { id: "card" as const, icon: CreditCard, label: t("methodCard") },
    { id: "netbanking" as const, icon: Landmark, label: t("methodNetbanking") },
  ];

  const pay = () => {
    setPaying(true);
    window.setTimeout(() => {
      setPaying(false);
      onPaid();
    }, 1200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("checkoutTitle")}</DialogTitle>
          <DialogDescription>{t("checkoutDesc")}</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-muted/60 p-4 text-sm">
          <div className="flex justify-between font-medium text-foreground">
            <span>
              {t(`plan_${plan}`)} · {t(cycle)}
            </span>
            <span>{formatInr(subtotal)}</span>
          </div>
          <div className="mt-2 flex justify-between text-muted-foreground">
            <span>{t("gst")}</span>
            <span>{formatInr(gst)}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-base font-semibold text-foreground">
            <span>{t("totalToday")}</span>
            <span>{formatInr(total)}</span>
          </div>
        </div>

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
          <Button onClick={pay} disabled={paying} className="gap-1.5">
            {paying && <Loader2 className="size-4 animate-spin" />}
            {t("payAmount", { amount: formatInr(total) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
