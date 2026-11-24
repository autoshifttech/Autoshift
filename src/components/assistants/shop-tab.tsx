"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SHOP, type Assistant, type ShopSettings } from "@/lib/assistants/model";
import { useCatalog } from "@/lib/catalog";
import { isPaymentKind, useConnections } from "@/lib/flows/connections";
import { TemplatePicker } from "@/components/templates/template-picker";
import { TickBox } from "@/components/ui/tick-box";

const LANGS = ["en", "pt", "es", "ko"] as const;

/**
 * Shop: the assistant takes orders in the chat. Prices always come from the product list; online
 * orders get a Razorpay link on the business's own account, or the customer pays cash on delivery.
 */
export function ShopTab({ a, set }: { a: Assistant; set: (p: Partial<Assistant>) => void }) {
  const t = useTranslations("Shop");
  const shop: ShopSettings = { ...DEFAULT_SHOP, ...(a.shop ?? {}) };
  const put = (patch: Partial<ShopSettings>) => set({ shop: { ...shop, ...patch } });
  const { catalog, loaded } = useCatalog();
  const razorpay = useConnections().some((c) => isPaymentKind(c.kind));
  const num = (v: string) => (v === "" ? 0 : Math.max(0, Number(v) || 0));

  const checks = [
    { ok: Boolean(catalog?.products.length), text: catalog ? t("checkProducts", { count: catalog.products.length }) : loaded ? t("checkNoProducts") : t("loading"), href: "/files", link: t("openFiles") },
    { ok: !shop.online || razorpay, text: !shop.online ? t("checkOnlineOff") : razorpay ? t("checkRazorpay") : t("checkNoRazorpay"), href: "/flows/connections", link: t("openConnections") },
    { ok: a.enabled, text: a.enabled ? t("checkOn") : t("checkOff") },
  ];

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <label className="flex min-h-11 cursor-pointer items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{t("enable")}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{t("enableHelp")}</span>
        </span>
        <Switch checked={shop.enabled} onCheckedChange={(enabled) => put({ enabled })} aria-label={t("enable")} />
      </label>

      {shop.enabled && (
        <>
          <ul className="space-y-2 rounded-xl bg-muted/50 p-3" aria-label={t("checklist")}>
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />}
                <span className="min-w-0 text-foreground">
                  <span className="sr-only">{c.ok ? t("ready") : t("needsAction")}: </span>
                  {c.text}
                  {!c.ok && c.href && (
                    <>
                      {" "}
                      <Link href={c.href} className="font-medium text-primary underline-offset-2 hover:underline">
                        {c.link}
                      </Link>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-foreground">{t("payments")}</legend>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 focus-within:ring-2 focus-within:ring-ring">
              <TickBox className="mt-0.5" checked={shop.online} onChange={(e) => put({ online: e.target.checked || !shop.cod })} />
              <span>
                <span className="block text-sm font-medium text-foreground">{t("online")}</span>
                <span className="block text-xs text-muted-foreground">{t("onlineHelp")}</span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 focus-within:ring-2 focus-within:ring-ring">
              <TickBox className="mt-0.5" checked={shop.cod} onChange={(e) => put({ cod: e.target.checked || !shop.online })} />
              <span>
                <span className="block text-sm font-medium text-foreground">{t("cod")}</span>
                <span className="block text-xs text-muted-foreground">{t("codHelp")}</span>
              </span>
            </label>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Money id="shop-fee" label={t("deliveryFee")} help={t("deliveryFeeHelp")} value={shop.delivery_fee} onChange={(v) => put({ delivery_fee: num(v) })} />
            <Money id="shop-free" label={t("freeAbove")} help={t("freeAboveHelp")} value={shop.free_above} onChange={(v) => put({ free_above: num(v) })} />
            <Money id="shop-min" label={t("minOrder")} help={t("minOrderHelp")} value={shop.min_order} onChange={(v) => put({ min_order: num(v) })} />
            {shop.cod && <Money id="shop-codmax" label={t("codMax")} help={t("codMaxHelp")} value={shop.cod_max} onChange={(v) => put({ cod_max: num(v) })} />}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="shop-note">{t("deliveryNote")}</Label>
            <Textarea id="shop-note" rows={2} maxLength={300} value={shop.delivery_note} placeholder={t("deliveryNotePlaceholder")} onChange={(e) => put({ delivery_note: e.target.value })} />
          </div>

          <div className="grid max-w-xs gap-1.5">
            <Label htmlFor="shop-lang">{t("language")}</Label>
            <NativeSelect id="shop-lang" value={shop.language} onChange={(e) => put({ language: e.target.value as ShopSettings["language"] })} aria-describedby="shop-lang-help">
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {t(`lang_${l}`)}
                </option>
              ))}
            </NativeSelect>
            <p id="shop-lang-help" className="text-xs text-muted-foreground">
              {t("languageHelp")}
            </p>
          </div>

          <TemplatePicker kind="order" value={shop.update_template} language={shop.language} onChange={(update_template) => put({ update_template })} />

          <div className="rounded-xl border border-border p-4 text-sm">
            <p className="font-medium text-foreground">{t("howTitle")}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>{t("how1")}</li>
              <li>{t("how2")}</li>
              <li>{t("how3")}</li>
              <li>{t("how4")}</li>
            </ol>
            <Link href="/orders" className="mt-2 inline-flex min-h-11 items-center font-medium text-primary hover:underline">
              {t("openOrders")}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function Money({ id, label, help, value, onChange }: { id: string; label: string; help: string; value: number; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground" aria-hidden>
          ₹
        </span>
        <Input id={id} type="number" inputMode="decimal" min={0} step="any" className="pl-7" value={value || ""} placeholder="0" onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-help`} />
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {help}
      </p>
    </div>
  );
}
