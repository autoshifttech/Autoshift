import { describe, expect, it } from "vitest";
import { DEFAULT_DETAILS, cleanDetails } from "./legal-details";

describe("business details for the legal pages", () => {
  it("falls back to the defaults for empty fields", () => {
    expect(cleanDetails({}).details).toEqual(DEFAULT_DETAILS);
    expect(cleanDetails({ company: "  AutoShift Tech  ", refundDays: "5" }).details).toMatchObject({ company: "AutoShift Tech", refundDays: 5 });
  });
  it("rejects a bad email, GSTIN or refund period", () => {
    expect(cleanDetails({ email: "nope", gstin: "123", refundDays: 90 }).problems.sort()).toEqual(["email", "gstin", "refundDays"]);
    expect(cleanDetails({ gstin: "29abcde1234f1z5" }).problems).toEqual([]);
    expect(cleanDetails({ gstin: "29abcde1234f1z5" }).details.gstin).toBe("29ABCDE1234F1Z5");
  });
});
