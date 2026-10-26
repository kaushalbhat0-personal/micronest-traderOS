import { describe, expect, it } from "vitest";

import { FOUNDING_COHORT, PLANS, PLAN_IDS, PRICE_BOOK, getPrice } from "@/config/plans";
import { formatInrFromPaise } from "@/lib/format";

describe("plan catalogue", () => {
  it("defines exactly three entitlement plans", () => {
    expect([...PLAN_IDS]).toEqual(["free", "individual_pro", "all_access"]);
    expect(Object.keys(PLANS).sort()).toEqual([...PLAN_IDS].sort());
  });

  it("stores every price as a positive integer in paise", () => {
    for (const price of PRICE_BOOK) {
      expect(Number.isSafeInteger(price.amountPaise)).toBe(true);
      expect(price.amountPaise).toBeGreaterThan(0);
    }
  });

  it("prices the standard plans as specified", () => {
    expect(getPrice("individual_pro", "month")?.amountPaise).toBe(19_900);
    expect(getPrice("individual_pro", "year")?.amountPaise).toBe(199_900);
    expect(getPrice("all_access", "month")?.amountPaise).toBe(59_900);
    expect(getPrice("all_access", "year")?.amountPaise).toBe(499_900);
  });

  it("represents founding as an All Access price cohort with 100 seats", () => {
    expect(FOUNDING_COHORT.entitlementPlanId).toBe("all_access");
    expect(FOUNDING_COHORT.seats).toBe(100);
    expect(getPrice("all_access", "month", "founding")?.amountPaise).toBe(39_900);
    expect(getPrice("all_access", "year", "founding")?.amountPaise).toBe(399_900);
  });

  it("does not invent a free price entry", () => {
    expect(getPrice("free", "month")).toBeUndefined();
    expect(getPrice("free", "year")).toBeUndefined();
  });

  it("has no duplicate plan/interval/cohort entries", () => {
    const keys = PRICE_BOOK.map((price) => `${price.planId}:${price.interval}:${price.cohort}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("formatInrFromPaise", () => {
  it("formats whole rupees with Indian grouping", () => {
    expect(formatInrFromPaise(19_900)).toBe("₹199");
    expect(formatInrFromPaise(499_900)).toBe("₹4,999");
    expect(formatInrFromPaise(399_900)).toBe("₹3,999");
  });

  it("rejects non-integer paise", () => {
    expect(() => formatInrFromPaise(199.5)).toThrow(RangeError);
  });
});
