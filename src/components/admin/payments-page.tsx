"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, BadgeIndianRupee, CalendarClock, Download, Printer, ReceiptText, RotateCcw, Search, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ADMIN_NOW, businessById, type Payment, type PaymentKind, type PaymentStatus } from "@/lib/admin/data";
import { date, dateTime, downloadCsv, inr, inrShort, num } from "@/lib/admin/format";
import { act, useBusinesses, usePayments } from "@/lib/admin/store";
import { DataTable, EmptyState, Kpi, PageHeader, Panel, Pill, td } from "./admin-ui";

const DAY = 864e5;
const KIND_LABEL: Record<PaymentKind, string> = { subscription: "Subscription", topup: "Wallet top-up", refund: "Refund" };
const STATUS_TONE: Record<PaymentStatus, "green" | "red" | "violet" | "amber"> = { captured: "green", failed: "red", refunded: "violet", pending: "amber" };
const inRange = (p: Payment, days: number) => ADMIN_NOW - new Date(p.at).getTime() <= days * DAY;
const STATUS_LABEL: Record<PaymentStatus, string> = { captured: "Paid", failed: "Failed", refunded: "Refunded", pending: "Pending" };

export function PaymentsPage() {
  const payments = usePayments();
  const businesses = useBusinesses();
  const params = useSearchParams();
  const [business, setBusiness] = useState(params.get("business") ?? "");
  const [kind, setKind] = useState<PaymentKind | "all">("all");
  const [status, setStatus] = useState<PaymentStatus | "all">("all");
  const [range, setRange] = useState<"7" | "30" | "90" | "all">("30");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [refundOf, setRefundOf] = useState<Payment | null>(null);
  const [invoiceOf, setInvoiceOf] = useState<Payment | null>(null);

  const last30 = payments.filter((p) => inRange(p, 30));
  const collected = last30.filter((p) => p.status === "captured" && p.kind !== "refund").reduce((s, p) => s + p.amount, 0);
  const gst = last30.filter((p) => p.status === "captured" && p.kind !== "refund").reduce((s, p) => s + p.gst, 0);
  const failed = last30.filter((p) => p.status === "failed");
  const refunds = last30.filter((p) => p.kind === "refund").reduce((s, p) => s + p.amount, 0) - last30.filter((p) => p.kind !== "refund" && p.status === "refunded").reduce((s, p) => s + p.amount, 0);
  const renewals = businesses.filter((b) => b.renewsAt && new Date(b.renewsAt).getTime() - ADMIN_NOW <= 7 * DAY && new Date(b.renewsAt).getTime() >= ADMIN_NOW).sort((a, b) => a.renewsAt!.localeCompare(b.renewsAt!));

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments.filter((p) => {
      if (business && p.businessId !== business) return false;
      if (kind !== "all" && p.kind !== kind) return false;
      if (status !== "all" && p.status !== status) return false;
      if (range !== "all" && !inRange(p, Number(range))) return false;
      if (!q) return true;
      const b = businessById(p.businessId);
      return `${b?.name} ${p.razorpayId} ${p.invoice ?? ""}`.toLowerCase().includes(q);
    });
  }, [payments, business, kind, status, range, query]);

  const open = payments.find((p) => p.id === openId) ?? null;
  const openBiz = open ? businessById(open.businessId) : undefined;

  const exportCsv = () =>
    downloadCsv("autoshift-payments.csv", [
      ["Date", "Business", "Type", "Amount", "GST", "Total", "Method", "Status", "Razorpay ID", "Invoice", "Failure reason"],
      ...rows.map((p) => [p.at.slice(0, 16).replace("T", " "), businessById(p.businessId)?.name, KIND_LABEL[p.kind], p.amount, p.gst, p.amount + p.gst, p.method, STATUS_LABEL[p.status], p.razorpayId, p.invoice, p.failureReason]),
    ]);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every subscription charge, wallet top-up and refund from Razorpay. Amounts are before GST unless marked total."
        actions={
          <Button variant="outline" className="gap-1.5" onClick={exportCsv}>
            <Download className="size-4" />
            Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={BadgeIndianRupee} label="Collected, 30 days" value={inrShort(collected)} hint="before GST" />
        <Kpi icon={ReceiptText} tone="butter" label="GST collected, 30 days" value={inrShort(gst)} hint="to pay to the government" />
        <Kpi icon={AlertTriangle} tone="peach" label="Failed payments, 30 days" value={num(failed.length)} hint={inr(failed.reduce((s, p) => s + p.amount, 0))} />
        <Kpi icon={Undo2} tone="lilac" label="Refunded, 30 days" value={inr(Math.abs(refunds))} />
        <Kpi icon={CalendarClock} tone="sky" label="Renewals, next 7 days" value={num(renewals.length)} hint={inr(renewals.reduce((s, b) => s + b.mrr, 0))} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel bodyClassName="p-0">
          <div className="flex flex-col gap-2 border-b border-border p-4">
            <div className="flex flex-col gap-2 lg:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search business, Razorpay ID or invoice" aria-label="Search payments" />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
                <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as PaymentKind | "all")} aria-label="Type" className="lg:w-40">
                  <option value="all">All types</option>
                  <option value="subscription">Subscriptions</option>
                  <option value="topup">Wallet top-ups</option>
                  <option value="refund">Refunds</option>
                </NativeSelect>
                <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus | "all")} aria-label="Status" className="lg:w-36">
                  <option value="all">Any status</option>
                  <option value="captured">Paid</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </NativeSelect>
                <NativeSelect value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="Date range" className="col-span-2 sm:col-span-1 lg:w-36">
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="all">All time</option>
                </NativeSelect>
              </div>
            </div>
            {business && (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {businessById(business)?.name ?? business}
                <button type="button" aria-label="Clear business filter" onClick={() => setBusiness("")}>
                  <X className="size-3" />
                </button>
              </span>
            )}
          </div>
          <DataTable
            head={["Date", "Business", "Type", "Amount", "Total incl. GST", "Method", "Status", "Invoice"]}
            className="[&_table]:min-w-[900px]"
            empty={rows.length === 0 ? <EmptyState icon={ReceiptText} title="No payments match" detail="Try a longer date range or clear the filters." /> : undefined}
          >
            {rows.slice(0, 150).map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenId(p.id)}>
                <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{dateTime(p.at)}</td>
                <td className={cn(td, "font-medium")}>{businessById(p.businessId)?.name}</td>
                <td className={cn(td, "whitespace-nowrap")}>{KIND_LABEL[p.kind]}</td>
                <td className={cn(td, "whitespace-nowrap tabular-nums", p.amount < 0 && "text-rose-700 dark:text-rose-400")}>{inr(p.amount)}</td>
                <td className={cn(td, "whitespace-nowrap tabular-nums")}>{inr(p.amount + p.gst)}</td>
                <td className={cn(td, "text-xs uppercase text-muted-foreground")}>{p.method}</td>
                <td className={td}>
                  <Pill tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Pill>
                </td>
                <td className={cn(td, "font-mono text-xs text-muted-foreground")}>{p.invoice ?? "—"}</td>
              </tr>
            ))}
          </DataTable>
          <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            {rows.length > 150 ? `Showing the latest 150 of ${rows.length} payments. Export CSV for all.` : `${rows.length} payments`}
          </p>
        </Panel>

        <Panel title="Renewing in the next 7 days" bodyClassName="px-0 pb-2">
          <ul className="divide-y divide-border">
            {renewals.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/businesses/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-muted/50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{b.name}</span>
                    <span className="block text-xs text-muted-foreground capitalize">
                      {b.plan} · {date(b.renewsAt!)}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums">{inr(b.mrr)}</span>
                </Link>
              </li>
            ))}
            {renewals.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No renewals this week.</li>}
          </ul>
        </Panel>
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {KIND_LABEL[open.kind]} · {inr(open.amount + open.gst, 2)}
                </SheetTitle>
                <SheetDescription>
                  {openBiz?.name} · {dateTime(open.at)}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6">
                <Pill tone={STATUS_TONE[open.status]}>{STATUS_LABEL[open.status]}</Pill>
                {open.failureReason && <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{open.failureReason}</p>}
                <dl className="divide-y divide-border rounded-xl border border-border text-sm">
                  {[
                    ["Amount", inr(open.amount, 2)],
                    ["GST (18%)", inr(open.gst, 2)],
                    ["Total", inr(open.amount + open.gst, 2)],
                    ["Method", open.method.toUpperCase()],
                    ["Razorpay ID", open.razorpayId],
                    ["Invoice", open.invoice ?? "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 px-3 py-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-medium break-all text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="grid gap-2">
                  {open.invoice && (
                    <Button variant="outline" className="gap-1.5" onClick={() => setInvoiceOf(open)}>
                      <ReceiptText className="size-4" />
                      View GST invoice
                    </Button>
                  )}
                  {open.status === "captured" && open.kind !== "refund" && (
                    <Button variant="outline" className="gap-1.5" onClick={() => setRefundOf(open)}>
                      <Undo2 className="size-4" />
                      Refund
                    </Button>
                  )}
                  {open.status === "failed" && (
                    <Button
                      className="gap-1.5"
                      onClick={() => {
                        act("Retried payment", openBiz?.name ?? "", `${open.razorpayId} · ${inr(open.amount)}`);
                        toast.success("Retry sent to Razorpay. The owner gets a payment link too.");
                      }}
                    >
                      <RotateCcw className="size-4" />
                      Retry charge
                    </Button>
                  )}
                  {openBiz && (
                    <Link href={`/admin/businesses/${openBiz.id}`} className="text-center text-sm font-medium text-primary hover:underline">
                      Open {openBiz.name}
                    </Link>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <RefundDialog payment={refundOf} onClose={() => setRefundOf(null)} />
      <InvoiceDialog payment={invoiceOf} onClose={() => setInvoiceOf(null)} />
    </>
  );
}

function RefundDialog({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const b = payment ? businessById(payment.businessId) : undefined;
  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {payment && (
          <>
            <DialogHeader>
              <DialogTitle>Refund {inr(payment.amount + payment.gst, 2)}?</DialogTitle>
              <DialogDescription>
                Razorpay returns the money to {b?.name}&apos;s {payment.method.toUpperCase()} in 5–7 working days. {payment.kind === "topup" ? "The credits are removed from their wallet." : "Their plan stays active until the period ends."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="refund-reason">Reason</Label>
              <NativeSelect id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Choose a reason…</option>
                <option>Charged twice</option>
                <option>Customer asked to cancel</option>
                <option>Service problem on our side</option>
                <option>Goodwill</option>
              </NativeSelect>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!reason}
                onClick={() => {
                  act("Refunded payment", b?.name ?? "", `${inr(payment.amount + payment.gst, 2)} · ${reason}`, (s) => ({ refunded: [...s.refunded, payment.id] }));
                  toast.success("Refund started");
                  setReason("");
                  onClose();
                }}
              >
                Refund
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const b = payment ? businessById(payment.businessId) : undefined;
  const print = () => {
    const html = document.getElementById("gst-invoice")?.outerHTML;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w || !html) return;
    w.document.write(`<!doctype html><title>${payment?.invoice}</title><style>body{font-family:system-ui,sans-serif;padding:32px;color:#111}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}</style>${html}`);
    w.document.close();
    w.print();
  };
  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {payment && b && (
          <>
            <DialogHeader>
              <DialogTitle>Tax invoice {payment.invoice}</DialogTitle>
              <DialogDescription>Sent to {b.owner.email} when the payment was captured.</DialogDescription>
            </DialogHeader>
            <div id="gst-invoice" className="space-y-4 rounded-xl border border-border p-4 text-sm">
              <div className="flex justify-between gap-4">
                <div>
                  <p className="font-bold">AutoShift</p>
                  <p className="text-xs text-muted-foreground">GSTIN 29ABCDE1234F1Z5 (sample)</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Invoice {payment.invoice}</p>
                  <p>Date {date(payment.at, true)}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Billed to</p>
                <p className="font-medium">{b.name}</p>
                <p className="text-xs text-muted-foreground">
                  {b.owner.name} · {b.city}
                </p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2">Item</th>
                    <th className="r py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="py-2">{payment.kind === "subscription" ? `AutoShift ${b.plan} plan (${b.cycle})` : "WhatsApp credits (wallet top-up)"}</td>
                    <td className="r py-2 text-right tabular-nums">{inr(payment.amount, 2)}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2">IGST 18%</td>
                    <td className="r py-2 text-right tabular-nums">{inr(payment.gst, 2)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-2">Total</td>
                    <td className="r py-2 text-right tabular-nums">{inr(payment.amount + payment.gst, 2)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground">Paid by {payment.method.toUpperCase()} · {payment.razorpayId}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button className="gap-1.5" onClick={print}>
                <Printer className="size-4" />
                Print or save PDF
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

