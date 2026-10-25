"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/wallet/model";
import { STATES, billingErrors, checkGstin, stateName, type BillingDetails, type BillingField, type TaxSplit } from "@/lib/billing/gst";
import { cn } from "@/lib/utils";

/** Invoice details for a GST invoice. Controlled; `showErrors` once the user tries to continue. */
export function GstDetailsForm({ value, onChange, showErrors }: { value: BillingDetails; onChange: (v: BillingDetails) => void; showErrors: boolean }) {
  const t = useTranslations("Gst");
  const errors = billingErrors(value);
  const err = (f: BillingField) => (showErrors || (f === "gstin" && value.gstin.length >= 15) ? errors[f] : undefined);
  const set = (patch: Partial<BillingDetails>) => onChange({ ...value, ...patch });
  const message = (f: BillingField) => {
    const e = err(f);
    return e ? <p className="text-xs text-rose-600">{t(`error_${f}_${e}`)}</p> : null;
  };
  const field = (f: BillingField, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`gst-${f}`} className="text-xs">
        {label}
      </Label>
      <Input id={`gst-${f}`} aria-invalid={!!err(f)} className={cn("h-9", err(f) && "border-rose-500")} value={value[f] as string} onChange={(e) => set({ [f]: e.target.value } as Partial<BillingDetails>)} {...props} />
      {message(f)}
    </div>
  );

  return (
    <div className="space-y-3">
      {field("legalName", t("legalName"), { placeholder: t("legalNamePlaceholder"), autoComplete: "organization" })}
      <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
        <span>
          <span className="block font-medium text-foreground">{t("hasGstin")}</span>
          <span className="block text-xs text-muted-foreground">{t("hasGstinHint")}</span>
        </span>
        <Switch checked={value.hasGstin} onCheckedChange={(v) => set({ hasGstin: v })} aria-label={t("hasGstin")} />
      </label>
      {value.hasGstin && (
        <div className="space-y-1">
          <Label htmlFor="gst-gstin" className="text-xs">
            {t("gstin")}
          </Label>
          <Input
            id="gst-gstin"
            value={value.gstin}
            maxLength={15}
            placeholder="22AAAAA0000A1Z5"
            aria-invalid={!!err("gstin")}
            className={cn("h-9 font-mono uppercase", err("gstin") && "border-rose-500")}
            onChange={(e) => {
              const gstin = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "");
              const g = checkGstin(gstin);
              // The GSTIN says which state the business is registered in.
              set({ gstin, ...(g.ok ? { stateCode: g.stateCode } : {}) });
            }}
          />
          {message("gstin")}
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="gst-state" className="text-xs">
          {t("state")}
        </Label>
        <NativeSelect id="gst-state" value={value.stateCode} onChange={(e) => set({ stateCode: e.target.value })} aria-invalid={!!err("stateCode")}>
          <option value="">{t("statePlaceholder")}</option>
          {STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name} ({s.code})
            </option>
          ))}
        </NativeSelect>
        {message("stateCode")}
      </div>
      {value.hasGstin && (
        <>
          {field("address", t("address"), { autoComplete: "street-address" })}
          <div className="grid grid-cols-2 gap-3">
            {field("city", t("city"), { autoComplete: "address-level2" })}
            {field("pincode", t("pincode"), { inputMode: "numeric", maxLength: 6, autoComplete: "postal-code" })}
          </div>
        </>
      )}
      {field("email", t("invoiceEmail"), { type: "email", placeholder: t("invoiceEmailPlaceholder"), autoComplete: "email" })}
    </div>
  );
}

/** Subtotal and the GST lines that apply. */
export function TaxLines({ split, label }: { split: TaxSplit; label: string }) {
  const t = useTranslations("Gst");
  return (
    <div className="rounded-xl bg-muted/60 p-4 text-sm">
      <div className="flex justify-between font-medium text-foreground">
        <span>{label}</span>
        <span>{formatMoney(split.subtotal)}</span>
      </div>
      {split.intraState ? (
        <>
          <div className="mt-2 flex justify-between text-muted-foreground">
            <span>{t("cgst")}</span>
            <span>{formatMoney(split.cgst)}</span>
          </div>
          <div className="mt-1 flex justify-between text-muted-foreground">
            <span>{t("sgst")}</span>
            <span>{formatMoney(split.sgst)}</span>
          </div>
        </>
      ) : (
        <div className="mt-2 flex justify-between text-muted-foreground">
          <span>{t("igst")}</span>
          <span>{formatMoney(split.igst)}</span>
        </div>
      )}
      <div className="mt-3 flex justify-between border-t border-border pt-3 text-base font-semibold text-foreground">
        <span>{t("total")}</span>
        <span>{formatMoney(split.total)}</span>
      </div>
    </div>
  );
}

export function DetailsSummary({ d }: { d: BillingDetails }) {
  const t = useTranslations("Gst");
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs text-muted-foreground">{t("legalName")}</dt>
        <dd className="font-medium text-foreground">{d.legalName}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">{t("gstin")}</dt>
        <dd className="font-mono text-foreground">{d.hasGstin ? d.gstin : t("noGstin")}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">{t("state")}</dt>
        <dd className="text-foreground">{stateName(d.stateCode)}</dd>
      </div>
      {d.hasGstin && (
        <div>
          <dt className="text-xs text-muted-foreground">{t("address")}</dt>
          <dd className="text-foreground">
            {d.address}, {d.city} {d.pincode}
          </dd>
        </div>
      )}
      {d.email && (
        <div>
          <dt className="text-xs text-muted-foreground">{t("invoiceEmail")}</dt>
          <dd className="text-foreground">{d.email}</dd>
        </div>
      )}
    </dl>
  );
}
