import { describe, expect, it } from "vitest";
import { normalizePrefs } from "./prefs";
import { pageKey, placeCard } from "./tours";
import en from "../../../messages/en.json";
import pt from "../../../messages/pt.json";
import es from "../../../messages/es.json";
import ko from "../../../messages/ko.json";
import { ADMIN_TIPS, ADMIN_TOUR, BUSINESS_TIPS, BUSINESS_TOUR } from "./tours";

describe("Shifty prefs", () => {
  it("falls back to calm, no sound, nothing seen", () => {
    expect(normalizePrefs(null)).toEqual({ mode: "calm", sound: false, seen: {} });
    expect(normalizePrefs({ mode: "wild", sound: "yes" })).toEqual({ mode: "calm", sound: false, seen: {} });
    expect(normalizePrefs({ mode: "off", sound: true, seen: { "tour:welcome": true, x: false } })).toEqual({ mode: "off", sound: true, seen: { "tour:welcome": true } });
  });
});

describe("tours", () => {
  it("knows which page you are on", () => {
    expect(pageKey("/flows/123", "business")).toBe("flows");
    expect(pageKey("/", "business")).toBe("dashboard");
    expect(pageKey("/admin", "admin")).toBe("overview");
    expect(pageKey("/admin/payments/x", "admin")).toBe("payments");
  });
  it("keeps the coach card on screen", () => {
    const view = { w: 390, h: 800 }, card = { w: 340, h: 180 };
    const centred = placeCard(null, card, view);
    expect(centred.x).toBeGreaterThanOrEqual(12);
    const nearBottom = placeCard({ x: 20, y: 700, w: 60, h: 50 }, card, view, 100);
    expect(nearBottom.y + card.h).toBeLessThanOrEqual(view.h);
    const side = placeCard({ x: 10, y: 100, w: 60, h: 44 }, card, { w: 1280, h: 800 });
    expect(side.x).toBeGreaterThan(70);
  });
  it("has every tour and tip text in all four languages", () => {
    for (const m of [en, pt, es, ko] as Array<typeof en>) {
      const s = m.Shifty as unknown as { tour: Record<string, Record<string, { title?: string }>>; tips: Record<string, Record<string, string>> };
      for (const st of BUSINESS_TOUR) expect(s.tour.business[st.key].title).toBeTruthy();
      for (const st of ADMIN_TOUR) expect(s.tour.admin[st.key].title).toBeTruthy();
      for (const k of BUSINESS_TIPS) expect(s.tips.business[k]).toBeTruthy();
      for (const k of ADMIN_TIPS) expect(s.tips.admin[k]).toBeTruthy();
    }
  });
});
