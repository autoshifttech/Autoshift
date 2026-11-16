import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

import { storageContentType } from "./upload-media";

describe("storageContentType", () => {
  it("stores spreadsheets with a type the bucket accepts, whatever the phone says", () => {
    expect(storageContentType({ name: "Products.csv", type: "text/comma-separated-values" })).toBe("text/plain");
    expect(storageContentType({ name: "Products.CSV", type: "" })).toBe("text/plain");
    expect(storageContentType({ name: "Products.xlsx", type: "application/zip" })).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(storageContentType({ name: "photo.jpg", type: "image/jpeg" })).toBe("image/jpeg");
  });
});
