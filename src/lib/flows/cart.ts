import type { CartProduct } from "@/lib/flows/types";

/**
 * The customer's cart inside a flow run. Kept in flow_runs.vars so later steps can use
 * {{vars.cart_summary}}, {{vars.cart_total}} and {{vars.cart_count}} in messages, the lead and the
 * payment link.
 */
export interface CartLine {
  code: string;
  name: string;
  price: number;
  qty: number;
}

export const MAX_PRODUCTS = 200;
export const MAX_QTY = 99;

/** Rupees as WhatsApp text: 1498 → "1,498", 99.5 → "99.50". */
export function formatRupees(n: number): string {
  const fixed = Math.round(n * 100) / 100;
  return Number.isInteger(fixed)
    ? fixed.toLocaleString("en-IN")
    : fixed.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Rows pasted from Excel or typed: "P001, Cotton T-shirt, 499" or tab-separated. A header row
 * ("code, name, price") and blank lines are skipped. Returns the products and the line numbers
 * that couldn't be read.
 */
export function parseProducts(text: string): { products: CartProduct[]; bad: number[] } {
  const products: CartProduct[] = [];
  const bad: number[] = [];
  // code, name (may itself contain commas), price (may have ₹, "Rs" and thousands commas)
  const row = /^\s*([^,\t]+?)\s*[,\t]\s*(.+?)\s*[,\t]\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*$/i;
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const m = row.exec(line);
    if (!m) {
      // A header row ("Code, Name, Price") at the top is fine to skip.
      if (i === 0 && /code/i.test(line)) return;
      bad.push(i + 1);
      return;
    }
    const price = Number(m[3].replace(/,/g, ""));
    if (!Number.isFinite(price) || price <= 0) {
      bad.push(i + 1);
      return;
    }
    products.push({ code: m[1].slice(0, 20), name: m[2].slice(0, 60), price: Math.round(price * 100) / 100 });
  });
  return { products, bad };
}

/** Back to the text box: one "code, name, price" line per product. */
export function productsToText(products: CartProduct[]): string {
  return products.map((p) => `${p.code}, ${p.name}, ${p.price}`).join("\n");
}

/** The product a customer meant: its code (any case, spaces ignored) or its exact name. */
export function findProduct(products: CartProduct[], answer: string): CartProduct | null {
  const said = answer.trim().toLowerCase();
  if (!said) return null;
  const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  return (
    products.find((p) => squash(p.code) === squash(said)) ??
    products.find((p) => p.name.trim().toLowerCase() === said) ??
    null
  );
}

export function parseQty(text: string | undefined): number {
  const n = parseInt(String(text ?? "").replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_QTY);
}

export function readCart(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (l): l is CartLine =>
      !!l && typeof l === "object" && typeof (l as CartLine).code === "string" && typeof (l as CartLine).price === "number" && typeof (l as CartLine).qty === "number",
  );
}

/** Adds the product (or more of it) and returns the vars the next steps read. */
export function addToCart(cart: CartLine[], product: CartProduct, qty: number) {
  const next = cart.map((l) => ({ ...l }));
  const line = next.find((l) => l.code === product.code);
  if (line) line.qty = Math.min(line.qty + qty, MAX_QTY);
  else next.push({ code: product.code, name: product.name, price: product.price, qty });
  const total = Math.round(next.reduce((sum, l) => sum + l.price * l.qty, 0) * 100) / 100;
  return {
    cart: next,
    cart_total: String(total),
    cart_total_text: formatRupees(total),
    cart_count: String(next.reduce((n, l) => n + l.qty, 0)),
    cart_summary: next.map((l) => `${l.qty} × ${l.name} (${l.code}) – ₹${formatRupees(l.price * l.qty)}`).join("\n"),
    last_product: product.name,
  };
}
