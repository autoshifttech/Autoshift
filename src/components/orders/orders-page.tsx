"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Copy, MessageSquare, RefreshCw, Search, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyPanel } from "@/components/ui/empty-panel";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { BackendError } from "@/lib/backend/client";
import { ORDER_VIEWS, inView, itemLabel, matches, nextActions, rupees, updateOrder, useOrders, type OrderAction, type OrderView, type PaymentStatus, type OrderStatus, type ShopOrder } from "@/lib/orders";

const STATUS_STYLE: Record<OrderStatus, string> = {
  new: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  packed: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  shipped: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  delivered: "bg-primary/10 text-primary",
  cancelled: "bg-muted text-muted-foreground",
};
const PAY_STYLE: Record<PaymentStatus, string> = {
  awaiting: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  paid: "bg-primary/10 text-primary",
  cod: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  expired: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
  refunded: "bg-muted text-muted-foreground",
};

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className)}>{children}</span>;
}

export function OrdersPage() {
  const t = useTranslations("Orders");
  const locale = useLocale();
  const { orders, loaded, error, reload, replace } = useOrders();
  const [view, setView] = useState<OrderView>("todo");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => Object.fromEntries(ORDER_VIEWS.map((v) => [v, orders.filter((o) => inView(o, v)).length])) as Record<OrderView, number>, [orders]);
  const shown = orders.filter((o) => inView(o, view) && matches(o, query));
  const open = orders.find((o) => o.id === openId) ?? null;
  const date = (iso: string) => new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-5">
      <h2 className="sr-only">{t("title")}</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        <Button variant="outline" size="sm" className="min-h-11 gap-1.5 self-start sm:min-h-9" onClick={() => void reload()}>
          <RefreshCw className="size-4" aria-hidden />
          {t("refresh")}
        </Button>
      </div>

      <div role="tablist" aria-label={t("views")} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ORDER_VIEWS.map((v) => (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              view === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {t(`view_${v}`)}
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", view === v ? "bg-primary-foreground/20" : "bg-muted")}>{counts[v]}</span>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="min-h-11 pl-9" />
      </div>

      <section className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]" aria-live="polite">
        {!loaded ? (
          <p role="status" className="p-6 text-sm text-muted-foreground">
            {t("loading")}
          </p>
        ) : error ? (
          <p role="alert" className="p-6 text-sm text-destructive">
            {t("loadError")}
          </p>
        ) : shown.length === 0 ? (
          <EmptyPanel icon={ShoppingBag} mascot={orders.length ? undefined : "point"} title={orders.length ? t("emptyView") : t("emptyTitle")} description={orders.length ? undefined : t("emptyHelp")}>
            {!orders.length && (
              <Link href="/agents" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                {t("setUp")}
              </Link>
            )}
          </EmptyPanel>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => setOpenId(o.id)} className="flex w-full flex-col gap-2 p-4 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="font-semibold text-foreground">#{o.number}</span>
                      <span className="truncate text-sm text-foreground">{o.customer_name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {o.items.map((i) => `${i.qty} × ${itemLabel(i)}`).join(", ")} · {date(o.created_at)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Chip className={PAY_STYLE[o.payment_status]}>{t(`pay_${o.payment_status}`)}</Chip>
                    <Chip className={STATUS_STYLE[o.status]}>{t(`status_${o.status}`)}</Chip>
                    <span className="min-w-[5.5rem] text-right font-semibold tabular-nums text-foreground">{rupees(o.total_paise, locale)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <OrderDialog order={open} onClose={() => setOpenId(null)} onChanged={replace} date={date} />
    </div>
  );
}

function OrderDialog({ order, onClose, onChanged, date }: { order: ShopOrder | null; onClose: () => void; onChanged: (o: ShopOrder) => void; date: (iso: string) => string }) {
  const t = useTranslations("Orders");
  const locale = useLocale();
  const [notify, setNotify] = useState(true);
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState<OrderAction | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const run = async (action: OrderAction) => {
    if (!order) return;
    setBusy(action);
    try {
      const res = await updateOrder(order.id, action, { tracking: action === "shipped" ? tracking : undefined, notify });
      onChanged(res.order);
      if (action === "check_payment") {
        const said = res.payment ?? "error";
        (said === "paid" ? toast.success : said === "error" ? toast.error : toast.info)(t(`checked_${said}`));
        return;
      }
      if (res.notified) toast.success(t(res.sent_as === "template" ? "doneToldTemplate" : "doneTold", { action: t(`done_${action}`) }));
      else if (notify && res.not_notified_reason) toast.warning(t("doneNotTold", { action: t(`done_${action}`), reason: res.not_notified_reason }));
      else toast.success(t(`done_${action}`));
      setTracking("");
    } catch (err) {
      toast.error(err instanceof BackendError ? err.message : t("failed"));
    } finally {
      setBusy(null);
    }
  };

  const actions = order ? nextActions(order) : [];
  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {order && (
          <>
            <DialogHeader>
              <DialogTitle>{t("orderTitle", { n: order.number })}</DialogTitle>
              <DialogDescription>{date(order.created_at)}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2">
              <Chip className={PAY_STYLE[order.payment_status]}>{t(`pay_${order.payment_status}`)}</Chip>
              <Chip className={STATUS_STYLE[order.status]}>{t(`status_${order.status}`)}</Chip>
              <Chip className="bg-muted text-foreground">{t(`method_${order.payment_method}`)}</Chip>
            </div>

            <table className="w-full text-sm">
              <caption className="sr-only">{t("items")}</caption>
              <tbody className="divide-y divide-border">
                {order.items.map((i) => (
                  <tr key={`${i.code}|${i.option ?? ""}`}>
                    <td className="py-2 pr-2 text-foreground">
                      {i.qty} × {itemLabel(i)} <span className="text-xs text-muted-foreground">({i.code})</span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-foreground">{rupees(i.total_paise, locale)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 text-muted-foreground">{t("delivery")}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{order.delivery_paise ? rupees(order.delivery_paise, locale) : t("free")}</td>
                </tr>
                <tr>
                  <th scope="row" className="py-2 text-left font-semibold text-foreground">
                    {t("total")}
                  </th>
                  <td className="py-2 text-right font-semibold tabular-nums text-foreground">{rupees(order.total_paise, locale)}</td>
                </tr>
              </tbody>
            </table>

            <dl className="grid gap-3 rounded-xl bg-muted/50 p-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t("customer")}</dt>
                <dd className="text-foreground">
                  {order.customer_name}
                  {order.customer_phone && <span className="text-muted-foreground"> · {order.customer_phone}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("address")}</dt>
                <dd className="whitespace-pre-line text-foreground">{order.address}</dd>
              </div>
              {order.note && (
                <div>
                  <dt className="text-xs text-muted-foreground">{t("note")}</dt>
                  <dd className="text-foreground">{order.note}</dd>
                </div>
              )}
              {order.tracking && (
                <div>
                  <dt className="text-xs text-muted-foreground">{t("tracking")}</dt>
                  <dd className="break-all text-foreground">{order.tracking}</dd>
                </div>
              )}
              {order.payment_url && order.payment_status !== "paid" && (
                <div>
                  <dt className="text-xs text-muted-foreground">{t("paymentLink")}</dt>
                  <dd className="flex items-center gap-2">
                    <span className="min-w-0 truncate text-foreground">{order.payment_url}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0"
                      aria-label={t("copyLink")}
                      onClick={() => void navigator.clipboard.writeText(order.payment_url!).then(() => toast.success(t("copied")))}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </dd>
                </div>
              )}
            </dl>

            {order.payment_status === "paid" && order.payment_method === "online" && order.status === "cancelled" && <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{t("refundHint")}</p>}

            {actions.length > 0 && (
              <div className="space-y-3 border-t border-border pt-4">
                {actions.includes("shipped") && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="order-tracking">{t("trackingLabel")}</Label>
                    <Input id="order-tracking" value={tracking} maxLength={500} placeholder={t("trackingPlaceholder")} onChange={(e) => setTracking(e.target.value)} />
                  </div>
                )}
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                  {t("notify")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {actions
                    .filter((a) => a !== "cancelled")
                    .map((a, i) => (
                      <Button key={a} variant={i === 0 ? "default" : "outline"} className="min-h-11" disabled={!!busy} onClick={() => void run(a)}>
                        {busy === a ? t("working") : t(`action_${a}`)}
                      </Button>
                    ))}
                  <Button variant="ghost" className="min-h-11 text-destructive hover:text-destructive" disabled={!!busy} onClick={() => setConfirmCancel(true)}>
                    {t("action_cancelled")}
                  </Button>
                </div>
              </div>
            )}

            {order.conversation_id && (
              <Link href={`/inbox?c=${order.conversation_id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                <MessageSquare className="size-4" aria-hidden />
                {t("openChat")}
              </Link>
            )}

            <ConfirmDialog
              open={confirmCancel}
              onOpenChange={setConfirmCancel}
              title={t("cancelTitle", { n: order.number })}
              description={order.payment_status === "paid" ? t("cancelPaid") : t("cancelHelp")}
              confirmLabel={t("action_cancelled")}
              cancelLabel={t("keep")}
              onConfirm={() => void run("cancelled")}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
