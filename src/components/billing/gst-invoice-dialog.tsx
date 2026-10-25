"use client";

import { useTranslations } from "next-intl";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { stateName, taxSplit, type BillingDetails } from "@/lib/billing/gst";
import { LEGAL } from "@/lib/legal";
import { formatMoney } from "@/lib/wallet/model";

export interface InvoiceRow {
  id: string;
  date: string;
  amount: number;
  item: string;
}

/** A GST tax invoice the business can print or save as PDF. */
export function GstInvoiceDialog({ invoice, details, onClose }: { invoice: InvoiceRow | null; details: BillingDetails; onClose: () => void }) {
  const t = useTranslations("Gst");
  const split = invoice ? taxSplit(invoice.amount, details.stateCode || LEGAL.sellerStateCode, LEGAL.sellerStateCode) : null;

  const print = () => {
    const html = document.getElementById("gst-tax-invoice")?.outerHTML;
    const w = window.open("", "_blank", "width=820,height=960");
    if (!w || !html) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${invoice?.id ?? "Invoice"}</title><style>body{font-family:system-ui,sans-serif;padding:32px;color:#111}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}.muted{color:#666;font-size:12px}</style>${html}`);
    w.document.close();
    w.print();
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {invoice && split && (
          <>
            <DialogHeader>
              <DialogTitle>{t("taxInvoice", { id: invoice.id })}</DialogTitle>
              <DialogDescription>{details.legalName ? t("invoiceFor", { name: details.legalName }) : t("addDetailsFirst")}</DialogDescription>
            </DialogHeader>
            <div id="gst-tax-invoice" className="space-y-4 rounded-xl border border-border p-4 text-sm">
              <div className="flex justify-between gap-4">
                <div>
                  <p className="font-bold text-foreground">{LEGAL.company}</p>
                  <p className="muted text-xs text-muted-foreground">
                    {LEGAL.address} · {stateName(LEGAL.sellerStateCode)} ({LEGAL.sellerStateCode})
                  </p>
                  <p className="muted text-xs text-muted-foreground">GSTIN {LEGAL.sellerGstin || "—"}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">{t("taxInvoiceLabel")}</p>
                  <p>{invoice.id}</p>
                  <p>{new Date(invoice.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("billedTo")}</p>
                <p className="font-medium text-foreground">{details.legalName || "—"}</p>
                {details.hasGstin && (
                  <p className="muted text-xs text-muted-foreground">
                    GSTIN {details.gstin} · {details.address}, {details.city} {details.pincode}
                  </p>
                )}
                <p className="muted text-xs text-muted-foreground">
                  {t("placeOfSupply")}: {stateName(details.stateCode || LEGAL.sellerStateCode)} ({details.stateCode || LEGAL.sellerStateCode})
                </p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2">{t("item")}</th>
                    <th className="py-2">SAC</th>
                    <th className="r py-2 text-right">{t("amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="py-2">{invoice.item}</td>
                    <td className="py-2 font-mono text-xs">{LEGAL.sac}</td>
                    <td className="r py-2 text-right tabular-nums">{formatMoney(split.subtotal)}</td>
                  </tr>
                  {split.intraState ? (
                    <>
                      <tr className="border-b border-border">
                        <td className="py-2">{t("cgst")}</td>
                        <td />
                        <td className="r py-2 text-right tabular-nums">{formatMoney(split.cgst)}</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="py-2">{t("sgst")}</td>
                        <td />
                        <td className="r py-2 text-right tabular-nums">{formatMoney(split.sgst)}</td>
                      </tr>
                    </>
                  ) : (
                    <tr className="border-b border-border">
                      <td className="py-2">{t("igst")}</td>
                      <td />
                      <td className="r py-2 text-right tabular-nums">{formatMoney(split.igst)}</td>
                    </tr>
                  )}
                  <tr className="font-semibold">
                    <td className="py-2">{t("invoiceTotal")}</td>
                    <td />
                    <td className="r py-2 text-right tabular-nums">{formatMoney(split.total)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="muted text-xs text-muted-foreground">{t("reverseCharge")}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                {t("close")}
              </Button>
              <Button className="gap-1.5" onClick={print}>
                <Printer className="size-4" />
                {t("print")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
