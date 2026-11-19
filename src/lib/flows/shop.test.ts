import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeTables } from "./fake-db.test-helper";
import { addToCart, findProduct, parseProducts, parseQty } from "./cart";
import { begin, reply } from "./simulate";
import { validateFlowForActivation } from "./validate";

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  sendText: vi.fn(async (_args: { text: string }) => ({ whatsapp_message_id: "wamid.text" })),
  sendMedia: vi.fn(async (_args: { link: string }) => ({ whatsapp_message_id: "wamid.media" })),
  link: vi.fn(async (_args: Record<string, unknown>) => ({ id: "pl-1", short_url: "https://rzp.io/i/abc", qr_image_url: "https://rzp.io/qr.png", amount_paise: 199800, mode: "test", qr_problem: null })),
  google: vi.fn(async (_args: { service: string; params: Record<string, string> }) => ({ link: "https://calendar.google.com/event?eid=1" } as { link?: string })),
}));

vi.mock("./admin-client", async () => {
  const { createFakeDb } = await import("./fake-db.test-helper");
  return { supabaseAdmin: () => createFakeDb(h.tables as FakeTables) };
});
vi.mock("./meta-send", () => ({
  engineSendText: h.sendText,
  engineSendMedia: h.sendMedia,
  engineSendInteractiveButtons: vi.fn(async () => ({ whatsapp_message_id: "wamid.buttons" })),
  engineSendInteractiveList: vi.fn(async () => ({ whatsapp_message_id: "wamid.list" })),
}));
vi.mock("@/lib/backend/internal", () => ({ createPaymentLink: h.link, runGoogleAction: h.google }));

import { dispatchInboundToFlows } from "./engine";

const PRODUCTS = [
  { code: "P001", name: "Cotton T-shirt", price: 499 },
  { code: "P002", name: "Denim jeans", price: 999 },
];

describe("cart helpers", () => {
  it("reads rows pasted from Excel, skipping the header", () => {
    const { products, bad } = parseProducts("Code\tName\tPrice\nP001\tCotton T-shirt\t₹499\nP002, Denim jeans, 1,299\nbroken line");
    expect(products).toEqual([{ code: "P001", name: "Cotton T-shirt", price: 499 }, { code: "P002", name: "Denim jeans", price: 1299 }]);
    expect(bad).toEqual([4]);
  });
  it("finds by code or name, and adds up the cart", () => {
    expect(findProduct(PRODUCTS, " p 001 ")?.code).toBe("P001");
    expect(findProduct(PRODUCTS, "denim jeans")?.code).toBe("P002");
    expect(findProduct(PRODUCTS, "P009")).toBeNull();
    expect(parseQty("2 pcs")).toBe(2);
    expect(parseQty("")).toBe(1);
    const one = addToCart([], PRODUCTS[0], 2);
    const two = addToCart(one.cart, PRODUCTS[1], 1);
    const three = addToCart(two.cart, PRODUCTS[0], 1);
    expect(three.cart_total).toBe("2496");
    expect(three.cart_total_text).toBe("2,496");
    expect(three.cart_count).toBe("4");
    expect(three.cart_summary).toBe("3 × Cotton T-shirt (P001) – ₹1,497\n1 × Denim jeans (P002) – ₹999");
  });
});

const FLOW = { id: "flow-shop", account_id: "acct-1", user_id: "u-1", status: "active", trigger_type: "keyword", trigger_config: { keywords: ["order"] }, entry_node_id: "ask_code", fallback_policy: {}, created_at: "2026-01-01T00:00:00Z" };
const NODES = [
  { node_key: "ask_code", node_type: "collect_input", config: { prompt_text: "Product code?", var_key: "product", next_node_key: "ask_qty" } },
  { node_key: "ask_qty", node_type: "collect_input", config: { prompt_text: "How many?", var_key: "qty", next_node_key: "cart" } },
  { node_key: "cart", node_type: "add_to_cart", config: { products: PRODUCTS, product: "{{vars.product}}", quantity: "{{vars.qty}}", next_node_key: "lead", not_found_node_key: "missing" } },
  { node_key: "missing", node_type: "send_message", config: { text: "Not found", next_node_key: "ask_code" } },
  { node_key: "lead", node_type: "create_lead", config: { title: "Order", value: "{{vars.cart_total}}", notes: "{{vars.cart_summary}}", next_node_key: "pay" } },
  { node_key: "pay", node_type: "action", config: { service: "razorpay_link", connection_id: "conn-1", params: { amount: "{{vars.cart_total}}", description: "{{vars.cart_summary}}", send_qr: "yes" }, save_as: "payment_link", next_node_key: "link_msg", error_node_key: "oops" } },
  { node_key: "link_msg", node_type: "send_message", config: { text: "Pay ₹{{vars.cart_total_text}}: {{vars.payment_link}}", next_node_key: "qr" } },
  { node_key: "qr", node_type: "send_media", config: { media_type: "image", media_url: "{{vars.payment_link_qr}}", next_node_key: "done" } },
  { node_key: "oops", node_type: "send_message", config: { text: "Payment link failed", next_node_key: "done" } },
  { node_key: "done", node_type: "end", config: {} },
];

function setup() {
  h.tables = {
    flows: [FLOW],
    flow_nodes: NODES.map((n) => ({ flow_id: "flow-shop", ...n })),
    flow_runs: [],
    flow_run_events: [],
    messages: [],
    contacts: [{ id: "ct-1", account_id: "acct-1", name: "Ravi", phone: "+919800000000" }],
    pipelines: [{ id: "p1", account_id: "acct-1", name: "Orders" }],
    pipeline_stages: [{ id: "s1", pipeline_id: "p1", name: "New order", position: 0 }],
    deals: [],
  } as Record<string, Record<string, unknown>[]>;
}

let n = 0;
const say = (text: string) =>
  dispatchInboundToFlows({ accountId: "acct-1", userId: "u-1", contactId: "ct-1", conversationId: "cv-1", message: { kind: "text", text, meta_message_id: `m-${++n}` }, isFirstInboundMessage: false });

beforeEach(() => {
  h.sendText.mockClear();
  h.sendMedia.mockClear();
  h.link.mockClear();
});

describe("shop flow: cart, lead and payment link", () => {
  it("adds to the cart, saves the order and sends the link and QR", async () => {
    setup();
    await say("order");
    await say("p002");
    await say("2");
    expect(h.tables.deals[0]).toMatchObject({ title: "Order", value: 1998, notes: "2 × Denim jeans (P002) – ₹1,998" });
    expect(h.link).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acct-1", connectionId: "conn-1", amount: "1998", leadId: h.tables.deals[0].id, sendQr: true, customerPhone: "+919800000000" }));
    const texts = h.sendText.mock.calls.map((c) => c[0].text);
    expect(texts).toContain("Pay ₹1,998: https://rzp.io/i/abc");
    expect(h.sendMedia.mock.calls[0][0].link).toBe("https://rzp.io/qr.png");
    expect(h.tables.flow_runs[0].vars).toMatchObject({ cart_total: "1998", payment_link: "https://rzp.io/i/abc" });
  });

  it("asks again when the product isn't in the list", async () => {
    setup();
    await say("order");
    await say("P777");
    await say("1");
    const texts = h.sendText.mock.calls.map((c) => c[0].text);
    expect(texts.slice(-2)).toEqual(["Not found", "Product code?"]);
    expect(h.tables.deals).toHaveLength(0);
  });

  it("takes the 'if it fails' exit and skips an empty QR", async () => {
    setup();
    h.link.mockRejectedValueOnce(new Error("Connect your Razorpay account first"));
    await say("order");
    await say("P001");
    await say("1");
    expect(h.sendText.mock.calls.map((c) => c[0].text)).toContain("Payment link failed");
    expect(h.sendMedia).not.toHaveBeenCalled();
  });
});

describe("editor checks and test chat", () => {
  it("validates the cart step", () => {
    const issues = validateFlowForActivation({ name: "Shop", trigger_type: "keyword", trigger_config: { keywords: ["order"] }, entry_node_id: "cart" }, [{ node_key: "cart", node_type: "add_to_cart", config: { products: [], product: "", next_node_key: "", not_found_node_key: "" } }]);
    const fields = issues.filter((i) => i.node_key === "cart").map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(["products", "product", "next_node_key", "not_found_node_key"]));
    expect(validateFlowForActivation({ name: "Shop", trigger_type: "keyword", trigger_config: { keywords: ["order"] }, entry_node_id: "ask_code" }, NODES).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("simulates the cart and a pretend payment link", () => {
    let s = begin(NODES, "ask_code");
    s = reply(NODES, s, "P001");
    s = reply(NODES, s, "3");
    const bubbles = s.messages.filter((m) => m.kind === "bot").map((m) => (m as { text: string }).text);
    expect(bubbles).toContain("Pay ₹1,497: https://rzp.io/i/test-link");
    expect(s.messages.some((m) => m.kind === "note" && m.code === "cart")).toBe(true);
  });
});

describe("Add to cart from the product list (Files page)", () => {
  it("takes prices from product_catalog", async () => {
    setup();
    h.tables.product_catalog = [{ account_id: "acct-1", products: [{ code: "X9", name: "Silk Scarf", price: 750, details: { Colour: "Red" } }] }];
    h.tables.flow_nodes = h.tables.flow_nodes.map((n) => (n.node_key === "cart" ? { ...n, config: { ...(n.config as object), source: "catalog", products: [] } } : n));
    await say("order");
    await say("x9");
    await say("2");
    expect(h.tables.deals[0]).toMatchObject({ value: 1500, notes: "2 × Silk Scarf (X9) – ₹1,500" });
  });

  it("needs no pasted products when it uses the list", () => {
    const issues = validateFlowForActivation({ name: "Shop", trigger_type: "keyword", trigger_config: { keywords: ["order"] }, entry_node_id: "cart" }, [
      { node_key: "cart", node_type: "add_to_cart", config: { source: "catalog", products: [], product: "{{vars.product}}", next_node_key: "done", not_found_node_key: "done" } },
      { node_key: "done", node_type: "end", config: {} },
    ]);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("Google steps", () => {
  const GNODES = [
    { node_key: "ask", node_type: "collect_input", config: { prompt_text: "When?", var_key: "when", next_node_key: "sheet" } },
    { node_key: "sheet", node_type: "action", config: { service: "google_sheets_append", connection_id: "g-1", params: { spreadsheet: "1AbCdEfGhIj", sheet: "Leads", values: "{{contact.name}}\n{{contact.phone}}\n{{vars.when}}" }, save_as: "", next_node_key: "cal", error_node_key: "oops" } },
    { node_key: "cal", node_type: "action", config: { service: "google_calendar_event", connection_id: "g-1", params: { calendar: "primary", title: "Visit: {{contact.name}}", start: "{{vars.when}}", minutes: "30" }, save_as: "event_link", next_node_key: "ok", error_node_key: "oops" } },
    { node_key: "ok", node_type: "send_message", config: { text: "Booked: {{vars.event_link}}", next_node_key: "done" } },
    { node_key: "oops", node_type: "send_message", config: { text: "Google failed", next_node_key: "done" } },
    { node_key: "done", node_type: "end", config: {} },
  ];
  const useGoogleFlow = () => {
    setup();
    h.tables.flows = [{ ...FLOW, entry_node_id: "ask" }];
    h.tables.flow_nodes = GNODES.map((x) => ({ flow_id: "flow-shop", ...x }));
    h.google.mockClear();
  };

  it("adds the sheet row and calendar event with filled-in values", async () => {
    useGoogleFlow();
    await say("order");
    await say("2026-11-20 15:30");
    expect(h.google).toHaveBeenNthCalledWith(1, expect.objectContaining({ connectionId: "g-1", service: "google_sheets_append", params: expect.objectContaining({ values: "Ravi\n+919800000000\n2026-11-20 15:30" }) }));
    expect(h.google.mock.calls[1][0].params).toMatchObject({ title: "Visit: Ravi", start: "2026-11-20 15:30" });
    expect(h.sendText.mock.calls.map((c) => c[0].text)).toContain("Booked: https://calendar.google.com/event?eid=1");
  });

  it("takes the 'if it fails' exit when Google refuses", async () => {
    useGoogleFlow();
    h.google.mockRejectedValueOnce(new Error("Google: The caller does not have permission"));
    await say("order");
    await say("tomorrow");
    expect(h.sendText.mock.calls.map((c) => c[0].text)).toContain("Google failed");
    expect(h.tables.flow_run_events.some((e) => (e as { payload?: { reason?: string } }).payload?.reason === "google_action_failed")).toBe(true);
  });
});
