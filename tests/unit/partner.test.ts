import { describe, expect, it } from "vitest";

import { PARTNER_PROGRAM } from "@/config/partner";

describe("partner programme configuration", () => {
  it("encodes the 20% commission rate as basis points", () => {
    expect(PARTNER_PROGRAM.commissionRateBps).toBe(2_000);
    expect(PARTNER_PROGRAM.commissionRateBps / 100).toBe(20);
  });

  it("bases commission on received subscription revenue", () => {
    expect(PARTNER_PROGRAM.commissionBasis).toBe("received_subscription_revenue");
  });

  it("pays monthly", () => {
    expect(PARTNER_PROGRAM.payoutCadence).toBe("monthly");
  });

  it("supports UPI and bank transfer payouts only", () => {
    expect([...PARTNER_PROGRAM.payoutMethods]).toEqual(["upi", "bank_transfer"]);
  });
});
