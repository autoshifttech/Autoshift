"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseProducts, productsToText } from "@/lib/flows/cart";
import { useCatalog } from "@/lib/catalog";
import Link from "next/link";
import type { CartProduct } from "@/lib/flows/types";
import type { BuilderNode } from "../shared";
import { NextNodeRow } from "./fields";

export interface AddToCartCfg {
  source?: "list" | "catalog";
  products?: CartProduct[];
  product?: string;
  quantity?: string;
  next_node_key?: string;
  not_found_node_key?: string;
}

const label = "mb-1 block text-xs text-muted-foreground";
const hint = "mt-1 text-xs text-muted-foreground";

/**
 * Add to cart: the business's price list (pasted from Excel) and which answers hold the product
 * and the quantity. Later steps read {{vars.cart_summary}} and {{vars.cart_total}}.
 */
export function AddToCartForm({
  cfg,
  allNodes,
  currentKey,
  onUpdateConfig,
}: {
  cfg: AddToCartCfg;
  allNodes: BuilderNode[];
  currentKey: string;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("Flows.builder.form.cart");
  const [text, setText] = useState(() => productsToText(cfg.products ?? []));
  const [bad, setBad] = useState<number[]>([]);
  const count = cfg.products?.length ?? 0;
  const fromFile = cfg.source === "catalog";
  const { catalog } = useCatalog();

  const onText = (value: string) => {
    setText(value);
    const parsed = parseProducts(value);
    setBad(parsed.bad);
    onUpdateConfig({ products: parsed.products });
  };

  return (
    <>
      <fieldset className="space-y-2">
        <legend className={label}>{t("source")}</legend>
        {(["catalog", "list"] as const).map((v) => (
          <label key={v} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm focus-within:ring-2 focus-within:ring-ring">
            <input type="radio" name={`${currentKey}-source`} className="mt-0.5 size-4 accent-[var(--primary)]" checked={(v === "catalog") === fromFile} onChange={() => onUpdateConfig({ source: v })} />
            <span>
              <span className="block font-medium text-foreground">{t(`source_${v}`)}</span>
              <span className="block text-xs text-muted-foreground">
                {v === "catalog" ? (catalog ? t("catalogHas", { name: catalog.file_name, count: catalog.products.length }) : t("catalogNone")) : t("listHelp")}
              </span>
            </span>
          </label>
        ))}
        {fromFile && (
          <Link href="/files" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
            {t("openFiles")}
          </Link>
        )}
      </fieldset>

      {!fromFile && (
      <div>
        <label htmlFor={`${currentKey}-products`} className={label}>
          {t("products")}
        </label>
        <Textarea
          id={`${currentKey}-products`}
          rows={6}
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder={"P001, Cotton T-shirt, 499\nP002, Denim jeans, 1299"}
          className="bg-muted font-mono text-xs"
          aria-describedby={`${currentKey}-products-hint`}
        />
        <p id={`${currentKey}-products-hint`} className={hint}>
          {t("productsHelp")}
        </p>
        <p className="mt-1 text-xs font-medium text-foreground" aria-live="polite">
          {t("count", { count })}
          {bad.length > 0 && <span className="ml-2 text-rose-700 dark:text-rose-400">{t("badLines", { lines: bad.slice(0, 5).join(", ") })}</span>}
        </p>
      </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label htmlFor={`${currentKey}-product`} className={label}>
            {t("product")}
          </label>
          <Input id={`${currentKey}-product`} value={cfg.product ?? ""} onChange={(e) => onUpdateConfig({ product: e.target.value })} placeholder="{{vars.product}}" className="bg-muted font-mono text-xs" />
          <p className={hint}>{t.raw("productHelp") as string}</p>
        </div>
        <div>
          <label htmlFor={`${currentKey}-qty`} className={label}>
            {t("quantity")}
          </label>
          <Input id={`${currentKey}-qty`} value={cfg.quantity ?? ""} onChange={(e) => onUpdateConfig({ quantity: e.target.value })} placeholder="{{vars.qty}}" className="bg-muted font-mono text-xs" />
          <p className={hint}>{t.raw("quantityHelp") as string}</p>
        </div>
      </div>

      <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">{t.raw("varsHelp") as string}</p>

      <NextNodeRow value={cfg.next_node_key ?? ""} allNodes={allNodes} currentKey={currentKey} onChange={(v) => onUpdateConfig({ next_node_key: v })} label={t("then")} />
      <NextNodeRow value={cfg.not_found_node_key ?? ""} allNodes={allNodes} currentKey={currentKey} onChange={(v) => onUpdateConfig({ not_found_node_key: v })} label={t("notFound")} />
    </>
  );
}
