"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CreditCard, Landmark, Loader2, Lock, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MIN_TOPUP, TOPUP_PRESETS, formatMoney, topUp, withGst } from "@/lib/wallet/model";

type Method = "upi" | "card" | "netbanking";

/** Add credits. In production "Pay" opens Razorpay Checkout; here it simulates a successful payment. */
export function TopUpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("Wallet");
  const [amount, setAmount] = useState<number>(1000);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState<Method>("upi");
  const [paying, setPaying] = useState(false);
  const value = custom ? Number(custom) : amount;
  const tooLow = !Number.isFinite(value) || value < MIN_TOPUP;
  const { gst, total } = withGst(tooLow ? 0 : value);
  const methods = [
    { id: "upi" as const, icon: Smartphone, label: t("methodUpi") },
    { id: "card" as const, icon: CreditCard, label: t("methodCard") },
    { id: "netbanking" as const, icon: Landmark, label: t("methodNetbanking") },
  ];

  const pay = () => {
    if (tooLow) return;
    setPaying(true);
    window.setTimeout(() => {
      topUp(value, method);
      setPaying(false);
      onOpenChange(false);
      toast.success(t("topUpDone", { amount: formatMoney(value) }));
    }, 1100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("topUpTitle")}</DialogTitle>
          <DialogDescription>{t("topUpDesc")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2">
          {TOPUP_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={!custom && amount === p}
              onClick={() => {
                setAmount(p);
                setCustom("");
              }}
              className={cn(
                "rounded-xl border py-2.5 text-sm font-semibold transition-colors",
                !custom && amount === p ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted",
              )}
            >
              {formatMoney(p, undefined, 0)}
            </button>
          ))}
        </div>
        <div className="grid gap-1.5">
          <Input
            type="number"
            inputMode="numeric"
            min={MIN_TOPUP}
            placeholder={t("customAmount")}
            aria-label={t("customAmount")}
            value={custom}
            aria-invalid={!!custom && tooLow}
            onChange={(e) => setCustom(e.target.value)}
          />
          <p className={cn("text-xs", custom && tooLow ? "text-destructive" : "text-muted-foreground")}>{t("minTopUp", { amount: formatMoney(MIN_TOPUP, undefined, 0) })}</p>
        </div>

        <div className="rounded-xl bg-muted/60 p-4 text-sm">
          <div className="flex justify-between text-foreground">
            <span>{t("credits")}</span>
            <span>{formatMoney(tooLow ? 0 : value)}</span>
          </div>
          <div className="mt-1.5 flex justify-between text-muted-foreground">
            <span>{t("gst")}</span>
            <span>{formatMoney(gst)}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-base font-semibold text-foreground">
            <span>{t("total")}</span>
            <span>{formatMoney(total)}</span>
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
          <Button onClick={pay} disabled={paying || tooLow} className="gap-1.5">
            {paying && <Loader2 className="size-4 animate-spin" />}
            {t("pay", { amount: formatMoney(total) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
