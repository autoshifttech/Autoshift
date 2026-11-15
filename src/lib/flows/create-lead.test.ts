import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeTables } from "./fake-db.test-helper";

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  sendText: vi.fn(async () => ({ whatsapp_message_id: "wamid.text" })),
}));

vi.mock("./admin-client", async () => {
  const { createFakeDb } = await import("./fake-db.test-helper");
  return { supabaseAdmin: () => createFakeDb(h.tables as FakeTables) };
});

vi.mock("./meta-send", () => ({
  engineSendText: h.sendText,
  engineSendMedia: vi.fn(async () => ({ whatsapp_message_id: "wamid.media" })),
  engineSendInteractiveButtons: vi.fn(async () => ({ whatsapp_message_id: "wamid.buttons" })),
  engineSendInteractiveList: vi.fn(async () => ({ whatsapp_message_id: "wamid.list" })),
}));

import { dispatchInboundToFlows } from "./engine";

const FLOW = {
  id: "flow-visit",
  account_id: "acct-1",
  user_id: "u-1",
  status: "active",
  trigger_type: "keyword",
  trigger_config: { keywords: ["visit"] },
  entry_node_id: "lead",
  fallback_policy: {},
  created_at: "2026-01-01T00:00:00Z",
};

function setup(extra: Partial<FakeTables> = {}, leadConfig: Record<string, unknown> = {}) {
  h.tables = {
    flows: [FLOW],
    flow_nodes: [
      { flow_id: "flow-visit", node_key: "lead", node_type: "create_lead", config: { title: "Site visit – {{contact.name}}", value: "1200000", notes: "From WhatsApp {{contact.phone}}", next_node_key: "ok", ...leadConfig } },
      { flow_id: "flow-visit", node_key: "ok", node_type: "send_message", config: { text: "Booked!", next_node_key: "done" } },
      { flow_id: "flow-visit", node_key: "done", node_type: "end", config: {} },
    ],
    flow_runs: [],
    flow_run_events: [],
    messages: [],
    contacts: [{ id: "ct-1", account_id: "acct-1", name: "Asha", phone: "+919800000000" }],
    pipelines: [],
    pipeline_stages: [],
    deals: [],
    ...extra,
  } as Record<string, Record<string, unknown>[]>;
}

const visit = () =>
  dispatchInboundToFlows({
    accountId: "acct-1",
    userId: "u-1",
    contactId: "ct-1",
    conversationId: "cv-1",
    message: { kind: "text", text: "visit", meta_message_id: "m-1" },
    isFirstInboundMessage: false,
  });

beforeEach(() => h.sendText.mockClear());

describe("create_lead flow step", () => {
  it("adds a lead for the chat's contact and keeps going", async () => {
    setup({
      pipelines: [{ id: "p1", account_id: "acct-1", name: "Land sales", created_at: "2026-01-01" }],
      pipeline_stages: [{ id: "s2", pipeline_id: "p1", name: "Visit booked", position: 1 }, { id: "s1", pipeline_id: "p1", name: "New", position: 0 }],
    });
    await visit();
    const deal = h.tables.deals[0];
    expect(deal).toMatchObject({ account_id: "acct-1", contact_id: "ct-1", conversation_id: "cv-1", pipeline_id: "p1", title: "Site visit – Asha", value: 1200000, notes: "From WhatsApp +919800000000", status: "open", currency: "INR" });
    expect(h.sendText).toHaveBeenCalled();
  });

  it("uses the chosen stage, and makes a Sales pipeline when there is none", async () => {
    setup({ pipelines: [{ id: "p1", account_id: "acct-1", name: "Land sales" }], pipeline_stages: [{ id: "s1", pipeline_id: "p1", name: "New", position: 0 }, { id: "s2", pipeline_id: "p1", name: "Visit booked", position: 1 }] }, { pipeline_id: "p1", stage_id: "s2" });
    await visit();
    expect(h.tables.deals[0]).toMatchObject({ stage_id: "s2" });

    setup();
    await visit();
    expect(h.tables.pipelines).toHaveLength(1);
    expect(h.tables.pipelines[0]).toMatchObject({ name: "Sales", account_id: "acct-1" });
    expect(h.tables.pipeline_stages.length).toBeGreaterThan(0);
    expect(h.tables.deals).toHaveLength(1);
  });

  it("never uses another business's pipeline", async () => {
    setup({ pipelines: [{ id: "px", account_id: "acct-2", name: "Theirs" }], pipeline_stages: [{ id: "sx", pipeline_id: "px", name: "New", position: 0 }] }, { pipeline_id: "px", stage_id: "sx" });
    await visit();
    expect(h.tables.deals[0].pipeline_id).not.toBe("px");
  });
});
