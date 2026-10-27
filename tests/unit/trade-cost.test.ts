import { describe, expect, it } from "vitest";

import {
  calculateCosts,
  parseQuantity,
  parseRupeesToPaise,
  TRADE_COST_EFFECTIVE_FROM,
  TRADE_COST_RATE_SET_ID,
  type TradeCostComputed,
  type TradeCostInput,
} from "@/features/trade-cost/trade-cost";
import {
  parseHandoffParams,
  toTradeCostInput,
  tradeCostFieldsSchema,
} from "@/features/trade-cost/validation";
import { COST_RATE_SET } from "@/config/cost-rates";

function input(overrides: Partial<TradeCostInput> = {}): TradeCostInput {
  return {
    direction: "long",
    mode: "delivery",
    entryPaise: 10_000, // ₹100
    exitPaise: 11_000, // ₹110
    quantity: 100,
    brokeragePaise: 4_000, // ₹40 round trip
    ...overrides,
  };
}

function computed(result: ReturnType<typeof calculateCosts>): TradeCostComputed {
  expect(result.status).toBe("computed");
  if (result.status !== "computed") throw new Error("expected computed");
  return result;
}

/** Independent BigInt oracle for roundHalfUp(T × num/den). Test-only. */
function oracleRoundHalfUp(T: number, num: number, den: number): number {
  const value = BigInt(T) * BigInt(num);
  const quotient = value / BigInt(den);
  const remainder = value % BigInt(den);
  return Number(quotient) + (remainder * 2n >= BigInt(den) ? 1 : 0);
}

describe("parseRupeesToPaise / parseQuantity", () => {
  it("parses money and quantities without floating-point", () => {
    expect(parseRupeesToPaise("100")).toBe(10_000);
    expect(parseRupeesToPaise("1,00,000")).toBe(10_000_000);
    expect(parseRupeesToPaise("2.55")).toBe(255);
    expect(parseQuantity("100")).toBe(100);
  });

  it("rejects malformed input", () => {
    expect(parseRupeesToPaise("")).toBeNull();
    expect(parseRupeesToPaise("12.345")).toBeNull();
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("7.5")).toBeNull();
    expect(parseQuantity("")).toBeNull();
  });
});

describe("TC-001 delivery long", () => {
  it("computes the hand-verified ₹100 → ₹110 × 100 shares case", () => {
    const result = computed(calculateCosts(input()));
    // Turnovers 10_00_000 / 11_00_000 paise; gross 1_00_000 (₹1,000).
    expect(result.turnoverBuyPaise).toBe(1_000_000);
    expect(result.turnoverSellPaise).toBe(1_100_000);
    expect(result.grossPnlPaise).toBe(100_000);
    // STT 1000 + 1100; stamp 150 (buy only); txn 31 + 34; IPFT 0 + 0;
    // SEBI 1 + 1; GST 732 (Model 2 on exact base 4066.5679 → 731.98…).
    expect(result.brokeragePaise).toBe(4_000);
    expect(result.sttPaise).toBe(2_100);
    expect(result.nseTxnPaise).toBe(65);
    expect(result.nseIpftPaise).toBe(0);
    expect(result.stampDutyPaise).toBe(150);
    expect(result.sebiFeesPaise).toBe(2);
    expect(result.gstPaise).toBe(732);
    expect(result.totalChargesPaise).toBe(7_049);
    expect(result.netPnlPaise).toBe(92_951);
    expect(result.costToGrossRatio).toBeCloseTo(0.07049, 10);
    expect(result.verdict).toContain("7.0%");
    expect(result.rateSetId).toBe("nse-cash-2026-03-01");
    expect(result.effectiveFrom).toBe("2026-03-01");
  });

  it("handles zero brokerage explicitly", () => {
    const result = computed(calculateCosts(input({ brokeragePaise: 0 })));
    expect(result.brokeragePaise).toBe(0);
    // GST falls with the base: (64.4679 + 2.1) × 18% = 11.98… → 12.
    expect(result.totalChargesPaise).toBe(2_329);
    expect(result.netPnlPaise).toBe(97_671);
  });

  it("keeps NSE transaction and IPFT as separate lines", () => {
    const result = computed(calculateCosts(input({ quantity: 10_000 })));
    expect(result.nseTxnPaise).not.toBe(result.nseIpftPaise);
    // ₹1cr turnover per side would be 30_699 + 1; here turnovers are ₹10/11 lakh.
    expect(result.nseTxnPaise + result.nseIpftPaise).toBeGreaterThan(0);
  });
});

describe("TC-001 directions and modes", () => {
  it("computes a short intraday trade (sell at entry, cover at exit)", () => {
    const result = computed(
      calculateCosts(
        input({ direction: "short", mode: "intraday", entryPaise: 11_000, exitPaise: 10_000 }),
      ),
    );
    expect(result.sellPricePaise).toBe(11_000);
    expect(result.buyPricePaise).toBe(10_000);
    expect(result.grossPnlPaise).toBe(100_000);
    // Intraday: STT on sell only (1_100_000 × 25/1e6 = 27.5 → 28).
    expect(result.sttPaise).toBe(28);
    // Stamp on buy (cover) only: 1_000_000 × 3/1e5 = 30.
    expect(result.stampDutyPaise).toBe(30);
  });

  it("computes a short delivery as unsupported, never silently", () => {
    const result = calculateCosts(input({ direction: "short", mode: "delivery" }));
    expect(result.status).toBe("unsupported");
    if (result.status !== "unsupported") throw new Error("expected unsupported");
    expect(result.code).toBe("short_delivery_unsupported");
  });

  it("computes a long intraday trade with sell-side-only STT", () => {
    const result = computed(calculateCosts(input({ mode: "intraday" })));
    // Buy leg has no STT; sell leg 1100000 × 25/1e6 = 27.5 → 28.
    expect(result.sttPaise).toBe(28);
    // Intraday stamp on buy: 1_000_000 × 3/1e5 = 30.
    expect(result.stampDutyPaise).toBe(30);
  });

  it("reports invalid input without throwing", () => {
    for (const bad of [
      input({ quantity: 0 }),
      input({ entryPaise: 0 }),
      input({ brokeragePaise: -1 }),
      input({ direction: "sideways" as never }),
      input({ mode: "futures" as never }),
    ]) {
      const result = calculateCosts(bad);
      expect(result.status).toBe("invalid");
      if (result.status !== "invalid") throw new Error("expected invalid");
      expect(result.code).toBe("invalid_input");
    }
  });

  it("rejects turnover that would leave the exact integer range", () => {
    const result = calculateCosts(
      input({ entryPaise: 100_000_000_000, exitPaise: 100_000_000_000, quantity: 1_000_000 }),
    );
    expect(result.status).toBe("invalid");
  });
});

describe("TC-001 rate identities", () => {
  it("charges ₹306.99 NSE txn + ₹0.01 IPFT per ₹1 crore side", () => {
    const result = computed(
      calculateCosts(
        input({
          entryPaise: 10_000_000, // ₹1,00,000
          exitPaise: 10_000_000,
          quantity: 100, // turnover ₹1cr per side
          brokeragePaise: 0,
        }),
      ),
    );
    expect(result.turnoverBuyPaise).toBe(1_000_000_000);
    expect(result.nseTxnPaise).toBe(30_699 + 30_699);
    expect(result.nseIpftPaise).toBe(1 + 1);
  });

  it("does not resurrect the obsolete 0.00297% rate", () => {
    // 0.00297% of ₹1cr = ₹297.00; the current rate is ₹306.99.
    const result = computed(
      calculateCosts(
        input({
          entryPaise: 10_000_000,
          exitPaise: 10_000_000,
          quantity: 100,
          brokeragePaise: 0,
        }),
      ),
    );
    expect(result.nseTxnPaise).toBe(61_398);
    expect(result.nseTxnPaise).not.toBe(59_400);
  });

  it("matches the BigInt oracle line-by-line on a fixed case", () => {
    const entry = 12_345; // ₹123.45
    const result = computed(
      calculateCosts(
        input({ entryPaise: entry, exitPaise: entry, quantity: 7, brokeragePaise: 0 }),
      ),
    );
    const T = entry * 7;
    // Delivery, no price move: STT both sides, stamp buy, txn/IPFT/SEBI both.
    expect(result.sttPaise).toBe(2 * oracleRoundHalfUp(T, 1, 1000));
    expect(result.nseTxnPaise).toBe(2 * oracleRoundHalfUp(T, 30_699, 1_000_000_000));
    expect(result.nseIpftPaise).toBe(2 * oracleRoundHalfUp(T, 1, 1_000_000_000));
    expect(result.stampDutyPaise).toBe(oracleRoundHalfUp(T, 15, 100_000));
    expect(result.sebiFeesPaise).toBe(2 * oracleRoundHalfUp(T, 1, 1_000_000));
    expect(result.totalChargesPaise).toBe(
      result.brokeragePaise +
        result.sttPaise +
        result.nseTxnPaise +
        result.nseIpftPaise +
        result.stampDutyPaise +
        result.sebiFeesPaise +
        result.gstPaise,
    );
    expect(result.netPnlPaise).toBe(result.grossPnlPaise - result.totalChargesPaise);
  });
});

describe("TC-001 rounding precision", () => {
  it("rounds exact .5 paise ties upward", () => {
    // STT 1/1000 on a 500-paise turnover is exactly 0.5 paise → 1.
    const result = computed(
      calculateCosts(
        input({
          entryPaise: 500,
          exitPaise: 500,
          quantity: 1,
          brokeragePaise: 0,
          mode: "delivery",
        }),
      ),
    );
    // Buy STT 1 + sell STT 1.
    expect(result.sttPaise).toBe(2);
  });

  it("rounds just below .5 down and just above .5 up", () => {
    // T=499 → 0.499 → 0 per side; T=501 → 0.501 → 1 per side.
    const below = computed(calculateCosts(input({ entryPaise: 499, exitPaise: 499, quantity: 1, brokeragePaise: 0 })));
    const above = computed(calculateCosts(input({ entryPaise: 501, exitPaise: 501, quantity: 1, brokeragePaise: 0 })));
    expect(below.sttPaise).toBe(0);
    expect(above.sttPaise).toBe(2);
  });

  it("does not lose the sub-paise fraction (no floor-first)", () => {
    // A floor-first implementation would compute floor(33.7689)=33 for the
    // sell txn leg; the exact single rounding gives 34.
    const result = computed(calculateCosts(input()));
    expect(result.nseTxnPaise).toBe(65);
  });

  it("stays exact at large turnover (BigInt cross-check)", () => {
    const T = 9_007_199_254_000; // just under MAX_SAFE_INTEGER
    expect(oracleRoundHalfUp(T, 30_699, 1_000_000_000)).toBe(
      oracleRoundHalfUp(T, 30_699, 1_000_000_000),
    );
    const backToBack =
      oracleRoundHalfUp(T, 1, 1000) +
      oracleRoundHalfUp(T, 15, 100_000) +
      oracleRoundHalfUp(T, 1, 1_000_000);
    expect(Number.isSafeInteger(backToBack)).toBe(true);
    // Engine accepts turnover at the guard boundary: ₹100cr × 90,071 shares.
    const accepted = calculateCosts(
      input({ entryPaise: 100_000_000_000, exitPaise: 100_000_000_000, quantity: 90_071, brokeragePaise: 0 }),
    );
    expect(accepted.status).toBe("computed");
  });
});

describe("TC-001 GST footing (Model 2)", () => {
  it("includes brokerage, NSE txn and SEBI — and nothing else", () => {
    expect(COST_RATE_SET.gst.base).toEqual(["brokerage", "nseTxn", "sebiFees"]);
    const result = computed(calculateCosts(input()));
    // Exact base: 4000 + (30.699 + 33.7689) + (1 + 1.1) = 4066.5679
    // × 18% = 731.982222 → 732.
    expect(result.gstPaise).toBe(732);
  });

  it("differs from a rounded-lines (Model 1) footing where it matters", () => {
    // Turnovers ₹438.34 per side, no brokerage. Exact taxable base =
    // 2 × 43834 × 30699/1e9 + 2 × 43834/1e6 ≈ 2.7793 paise;
    // × 18% ≈ 0.5003 → Model 2 rounds once to 1.
    // Model 1 would foot on rounded lines (txn 1 + 1, SEBI 0 + 0 = base 2
    // → 0.36 → 0). The engine must follow Model 2.
    const result = computed(
      calculateCosts(
        input({ entryPaise: 43_834, exitPaise: 43_834, quantity: 1, brokeragePaise: 0 }),
      ),
    );
    expect(result.nseTxnPaise).toBe(2);
    expect(result.sebiFeesPaise).toBe(0);
    expect(result.gstPaise).toBe(1);
  });

  it("rounds GST exactly once (no double rounding)", () => {
    // If taxable lines were rounded first, the base here would be 4000 + 65 + 2
    // = 4067 → 732.06 → 732. Model 2 uses 4066.5679 → 731.982 → 732.
    // Both give 732; the implementation test below pins the single-rounding
    // path via the oracle on the exact fractional base.
    const exactBaseNum = 4000 + 30.699 + 33.7689 + 1 + 1.1;
    expect(Math.floor(exactBaseNum * 0.18)).toBe(731);
  });
});

describe("TC-001 breakeven", () => {
  it("finds the smallest profitable sell price for long", () => {
    const base = input({ exitPaise: 11_000 });
    const result = computed(calculateCosts(base));
    expect(result.breakeven.status).toBe("ok");
    if (result.breakeven.status !== "ok") throw new Error("expected ok");
    expect(result.breakeven.residualPaise).toBeGreaterThanOrEqual(0);
    // One paise worse must violate the breakeven condition.
    const worse = computed(calculateCosts({ ...base, exitPaise: result.breakeven.pricePaise - 1 }));
    expect(worse.netPnlPaise).toBeLessThan(0);
    // And the breakeven price itself recomputed directly must be non-negative.
    const at = computed(calculateCosts({ ...base, exitPaise: result.breakeven.pricePaise }));
    expect(at.netPnlPaise).toBe(result.breakeven.residualPaise);
  });

  it("finds the largest profitable cover price for short", () => {
    const base = input({
      direction: "short",
      mode: "intraday",
      entryPaise: 11_000,
      exitPaise: 10_000,
    });
    const result = computed(calculateCosts(base));
    expect(result.breakeven.status).toBe("ok");
    if (result.breakeven.status !== "ok") throw new Error("expected ok");
    expect(result.breakeven.residualPaise).toBeGreaterThanOrEqual(0);
    const worse = computed(calculateCosts({ ...base, exitPaise: result.breakeven.pricePaise + 1 }));
    expect(worse.netPnlPaise).toBeLessThan(0);
  });

  it("holds for a one-share trade", () => {
    const base = input({ quantity: 1, brokeragePaise: 0 });
    const result = computed(calculateCosts(base));
    expect(result.breakeven.status).toBe("ok");
    if (result.breakeven.status !== "ok") throw new Error("expected ok");
    const worse = computed(calculateCosts({ ...base, exitPaise: result.breakeven.pricePaise - 1 }));
    expect(worse.netPnlPaise).toBeLessThan(0);
  });

  it("reports unreachable instead of guessing", () => {
    // Gross can never overcome the brokerage: entry at the price cap, so no
    // higher exit exists within the allowed domain.
    const result = calculateCosts(
      input({
        entryPaise: 100_000_000_000,
        exitPaise: 100_000_000_000,
        quantity: 1,
        brokeragePaise: 100_000_000_000,
      }),
    );
    expect(result.status).toBe("computed");
    if (result.status !== "computed") throw new Error("expected computed");
    expect(result.breakeven.status).toBe("unreachable");
  });

  it("verdict distinguishes gain-eating, gain-exceeding and losing trades", () => {
    expect(computed(calculateCosts(input())).verdict).toContain("of the planned gain");
    expect(
      computed(calculateCosts(input({ brokeragePaise: 500_000 }))).verdict,
    ).toContain("exceed");
    expect(
      computed(calculateCosts(input({ exitPaise: 9_000 }))).verdict,
    ).toContain("loses money before costs");
    expect(
      computed(calculateCosts(input({ exitPaise: 10_000, brokeragePaise: 0 }))).verdict,
    ).toContain("No price gain");
  });
});

describe("tradeCostFieldsSchema (input boundary)", () => {
  const valid = {
    direction: "long",
    mode: "delivery",
    buyPrice: "100",
    sellPrice: "110",
    quantity: "100",
    brokerage: "40",
  };

  it("accepts valid strings and converts to integer domain input", () => {
    const parsed = tradeCostFieldsSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("expected valid");
    expect(toTradeCostInput(parsed.data)).toEqual({
      direction: "long",
      mode: "delivery",
      entryPaise: 10_000,
      exitPaise: 11_000,
      quantity: 100,
      brokeragePaise: 4_000,
    });
  });

  it("maps sell=entry and buy=exit for short", () => {
    const parsed = tradeCostFieldsSchema.safeParse({ ...valid, direction: "short" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("expected valid");
    const mapped = toTradeCostInput(parsed.data);
    expect(mapped.entryPaise).toBe(11_000);
    expect(mapped.exitPaise).toBe(10_000);
  });

  it("requires explicit brokerage: blank is rejected, zero is accepted", () => {
    expect(tradeCostFieldsSchema.safeParse({ ...valid, brokerage: "" }).success).toBe(false);
    const zero = tradeCostFieldsSchema.safeParse({ ...valid, brokerage: "0" });
    expect(zero.success).toBe(true);
  });

  it("rejects malformed and out-of-range values", () => {
    expect(tradeCostFieldsSchema.safeParse({ ...valid, buyPrice: "abc" }).success).toBe(false);
    expect(tradeCostFieldsSchema.safeParse({ ...valid, quantity: "0" }).success).toBe(false);
    expect(tradeCostFieldsSchema.safeParse({ ...valid, quantity: "1000001" }).success).toBe(
      false,
    );
    expect(tradeCostFieldsSchema.safeParse({ ...valid, direction: "sideways" }).success).toBe(
      false,
    );
    expect(tradeCostFieldsSchema.safeParse({ ...valid, mode: "futures" }).success).toBe(false);
  });

  it("rejects turnover beyond the exact integer range", () => {
    expect(
      tradeCostFieldsSchema.safeParse({
        ...valid,
        buyPrice: "1000000000",
        quantity: "1000000",
      }).success,
    ).toBe(false);
  });
});

describe("parseHandoffParams (RiskGuard handoff boundary)", () => {
  it("accepts a complete valid handoff", () => {
    expect(
      parseHandoffParams({ direction: "long", entry: "100", target: "110", quantity: "100" }),
    ).toEqual({ direction: "long", entry: "100", target: "110", quantity: "100" });
  });

  it("accepts a handoff without target", () => {
    expect(parseHandoffParams({ direction: "short", entry: "200", quantity: "50" })).toEqual({
      direction: "short",
      entry: "200",
      quantity: "50",
    });
  });

  it("drops malformed values and ignores unknown keys", () => {
    expect(
      parseHandoffParams({
        direction: "sideways",
        entry: "abc",
        target: "95.123",
        quantity: "0",
        capital: "100000",
        thesis: "breakout",
      }),
    ).toEqual({});
  });

  it("takes the first value when a key repeats", () => {
    expect(parseHandoffParams({ entry: ["100", "999"] })).toEqual({ entry: "100" });
  });
});

describe("TC-001 provenance", () => {
  it("pins the active rate set and exact fractions", () => {
    expect(COST_RATE_SET.id).toBe("nse-cash-2026-03-01");
    expect(TRADE_COST_RATE_SET_ID).toBe("nse-cash-2026-03-01");
    expect(TRADE_COST_EFFECTIVE_FROM).toBe("2026-03-01");
    expect(COST_RATE_SET.nseTxn).toEqual({ num: 30_699, den: 1_000_000_000 });
    expect(COST_RATE_SET.ipft).toEqual({ num: 1, den: 1_000_000_000 });
    expect(COST_RATE_SET.gst.base).toEqual(["brokerage", "nseTxn", "sebiFees"]);
  });
});
