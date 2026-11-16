import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/workspace/live", () => ({ isLive: () => false, myAccount: async () => ({ accountId: "a", userId: "u" }) }));

import { MAX_STAGES, PIPELINE_PRESETS, checkPipeline } from "./pipelines";
import en from "../../../messages/en.json";
import pt from "../../../messages/pt.json";
import es from "../../../messages/es.json";
import ko from "../../../messages/ko.json";

const stages = (...names: string[]) => names.map((name) => ({ name }));

describe("checkPipeline", () => {
  it("accepts a normal pipeline", () => {
    expect(checkPipeline("Orders", stages(...PIPELINE_PRESETS.orders), ["Land sales"])).toEqual([]);
  });
  it("needs a unique name", () => {
    expect(checkPipeline("  ", stages("New"), [])).toContain("nameRequired");
    expect(checkPipeline("land SALES", stages("New"), ["Land sales"])).toContain("nameTaken");
  });
  it("needs named, different stages within the limit", () => {
    expect(checkPipeline("X", [], [])).toContain("needStage");
    expect(checkPipeline("X", stages("New", " "), [])).toContain("stageEmpty");
    expect(checkPipeline("X", stages("Paid", "paid"), [])).toContain("stageDuplicate");
    expect(checkPipeline("X", stages(...Array.from({ length: MAX_STAGES + 1 }, (_, i) => `S${i}`)), [])).toContain("tooManyStages");
  });
});

describe("pipeline texts", () => {
  it("every language has the ready-made stage lists, with a stage the payment step recognises", () => {
    const paid = new Set(["paid", "pago", "pagado", "결제 완료"]);
    for (const m of [en, pt, es, ko]) {
      for (const k of Object.keys(PIPELINE_PRESETS)) {
        const list = (m.Pipelines as Record<string, unknown>)[`presetStages_${k}`] as string[];
        expect(list.length).toBe(PIPELINE_PRESETS[k as keyof typeof PIPELINE_PRESETS].length);
      }
      expect(m.Pipelines.presetStages_orders.some((s: string) => paid.has(s.toLowerCase()))).toBe(true);
    }
  });
});
