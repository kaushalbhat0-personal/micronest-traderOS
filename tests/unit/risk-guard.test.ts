import { describe, expect, it } from "vitest";

import {
  decidePosition,
  floorToLot,
  parseLotSize,
  parsePercentToBps,
  parseRupeesToPaise,
  type RiskGuardInput,
} from "@/features/risk-guard/risk-guard";
import {
  riskGuardFieldsSchema,
  toRiskGuardInput,
  parseHandoffParams,
} from "@/features/risk-guard/validation";

function input(overrides: Partial<RiskGuardInput> = {}): RiskGuardInput {
  return {
    capitalPaise: 10_000_000, // ₹1,00,000
    riskBps: 250, // 2.5%
    direction: "long",
    entryPaise: 10_000, // ₹100
    stopPaise: 9_500, // ₹95
    lotSize: 1,
    ...overrides,
  };
}

describe("parseRupeesToPaise", () => {
  it("converts decimals to integer paise without floating-point", () => {
    expect(parseRupeesToPaise("123.45")).toBe(12_345);
    expect(parseRupeesToPaise("100")).toBe(10_000);
    expect(parseRupeesToPaise("0.07")).toBe(7);
    expect(parseRupeesToPaise("0.1")).toBe(10);
    expect(parseRupeesToPaise("1,00,000")).toBe(10_000_000);
    expect(parseRupeesToPaise(" 250 ")).toBe(25_000);
  });

  it("rejects values that lose precision or are not plain decimals", () => {
    expect(parseRupeesToPaise("12.345")).toBeNull();
    expect(parseRupeesToPaise("abc")).toBeNull();
    expect(parseRupeesToPaise("")).toBeNull();
    expect(parseRupeesToPaise("12.")).toBeNull();
    expect(parseRupeesToPaise(".5")).toBeNull();
    expect(parseRupeesToPaise("-10")).toBeNull();
  });

  it("avoids the 2.55 * 100 floating-point trap", () => {
    // Binary floating-point gives 254.999...; the string parser gives exact bps.
    expect(2.55 * 100).not.toBe(255);
    expect(parsePercentToBps("2.55")).toBe(255);
  });
});

describe("parsePercentToBps", () => {
  it("converts percent strings to integer basis points", () => {
    expect(parsePercentToBps("2.5")).toBe(250);
    expect(parsePercentToBps("1")).toBe(100);
    expect(parsePercentToBps("0.01")).toBe(1);
    expect(parsePercentToBps("0.15")).toBe(15);
  });

  it("rejects over-precise or non-numeric input", () => {
    expect(parsePercentToBps("2.555")).toBeNull();
    expect(parsePercentToBps("")).toBeNull();
    expect(parsePercentToBps("two")).toBeNull();
  });
});

describe("parseLotSize", () => {
  it("accepts positive whole numbers", () => {
    expect(parseLotSize("1")).toBe(1);
    expect(parseLotSize("75")).toBe(75);
  });

  it("rejects zero, decimals and non-numeric input", () => {
    expect(parseLotSize("0")).toBeNull();
    expect(parseLotSize("7.5")).toBeNull();
    expect(parseLotSize("")).toBeNull();
    expect(parseLotSize("lot")).toBeNull();
  });
});

describe("floorToLot", () => {
  it("floors down to whole lots and never rounds up", () => {
    expect(floorToLot(400, 75)).toBe(5);
    expect(floorToLot(100, 100)).toBe(1);
    expect(floorToLot(99, 100)).toBe(0);
  });

  it("returns 0 for invalid arguments instead of throwing", () => {
    expect(floorToLot(10, 0)).toBe(0);
    expect(floorToLot(-5, 10)).toBe(0);
  });
});

describe("decidePosition happy paths", () => {
  it("sizes a long trade: ₹1,00,000 at 2.5% risk, ₹5 per-unit risk", () => {
    const result = decidePosition(input());
    expect(result.status).toBe("allowed");
    if (result.status !== "allowed") throw new Error("expected allowed");
    // budget = floor(10_000_000 × 250 / 10000) = 250_000; per-unit = 500
    expect(result.riskBudgetPaise).toBe(250_000);
    expect(result.riskPerUnitPaise).toBe(500);
    expect(result.maxQuantity).toBe(500);
    expect(result.lots).toBe(500);
    expect(result.quantity).toBe(500);
    expect(result.usedRiskPaise).toBe(250_000);
    expect(result.formulaId).toBe("RG-001");
  });

  it("sizes a short trade", () => {
    const result = decidePosition(
      input({
        capitalPaise: 5_000_000, // ₹50,000
        riskBps: 100, // 1% → budget 50_000
        direction: "short",
        entryPaise: 20_000, // ₹200
        stopPaise: 21_000, // ₹210 → per-unit 1_000
        lotSize: 25,
      }),
    );
    expect(result.status).toBe("allowed");
    if (result.status !== "allowed") throw new Error("expected allowed");
    expect(result.riskBudgetPaise).toBe(50_000);
    expect(result.riskPerUnitPaise).toBe(1_000);
    expect(result.maxQuantity).toBe(50);
    expect(result.lots).toBe(2);
    expect(result.quantity).toBe(50);
  });

  it("floors multiple lots and leaves the remainder unused", () => {
    const result = decidePosition(
      input({
        capitalPaise: 20_000_000, // ₹2,00,000
        riskBps: 200, // 2% → budget 400_000
        entryPaise: 15_000,
        stopPaise: 14_000, // per-unit 1_000 → max 400
        lotSize: 75,
      }),
    );
    expect(result.status).toBe("allowed");
    if (result.status !== "allowed") throw new Error("expected allowed");
    expect(result.maxQuantity).toBe(400);
    expect(result.lots).toBe(5);
    expect(result.quantity).toBe(375);
    expect(result.usedRiskPaise).toBe(375_000);
    expect(result.unusedRiskPaise).toBe(25_000);
    expect(result.rounding).toBe("Floor to lot size");
  });

  it("computes R:R for a long target (2:1)", () => {
    const result = decidePosition(
      input({
        entryPaise: 10_000,
        stopPaise: 9_000, // risk 1_000
        targetPaise: 12_000, // reward 2_000
      }),
    );
    expect(result.status).toBe("allowed");
    if (result.status !== "allowed") throw new Error("expected allowed");
    expect(result.rewardPerUnitPaise).toBe(2_000);
    expect(result.riskRewardRatio).toBe(2);
  });

  it("computes R:R for a short target (2:1)", () => {
    const result = decidePosition(
      input({
        direction: "short",
        entryPaise: 50_000, // ₹500
        stopPaise: 52_000, // risk 2_000
        targetPaise: 46_000, // reward 4_000
      }),
    );
    expect(result.status).toBe("allowed");
    if (result.status !== "allowed") throw new Error("expected allowed");
    expect(result.rewardPerUnitPaise).toBe(4_000);
    expect(result.riskRewardRatio).toBe(2);
  });

  it("leaves R:R absent when no target is given", () => {
    const result = decidePosition(input());
    expect(result.status).toBe("allowed");
    if (result.status !== "allowed") throw new Error("expected allowed");
    expect(result.rewardPerUnitPaise).toBeNull();
    expect(result.riskRewardRatio).toBeNull();
  });
});

describe("decidePosition boundary cases", () => {
  it("allows the exact one-lot case with zero unused risk", () => {
    const result = decidePosition(
      input({
        capitalPaise: 10_000_000,
        riskBps: 100, // budget 100_000
        entryPaise: 10_000,
        stopPaise: 9_000, // per-unit 1_000 → max 100
        lotSize: 100,
      }),
    );
    expect(result.status).toBe("allowed");
    if (result.status !== "allowed") throw new Error("expected allowed");
    expect(result.lots).toBe(1);
    expect(result.quantity).toBe(100);
    expect(result.unusedRiskPaise).toBe(0);
  });

  it("blocks when the budget is one paise short of one lot", () => {
    const result = decidePosition(
      input({
        capitalPaise: 9_999_900, // ₹99,999 → budget floor(9_999_900 × 100/10000) = 99_999
        riskBps: 100,
        entryPaise: 10_000,
        stopPaise: 9_000, // one lot costs 100_000
        lotSize: 100,
      }),
    );
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("too_small_for_one_lot");
    expect(result.riskBudgetPaise).toBe(99_999);
    expect(result.requiredForOneLotPaise).toBe(100_000);
    expect(result.maxQuantity).toBe(99);
  });

  it("handles very small per-unit risk (1 paise)", () => {
    const result = decidePosition(
      input({
        capitalPaise: 10_000, // ₹100
        riskBps: 100, // budget 100
        entryPaise: 10_001, // ₹100.01
        stopPaise: 10_000, // per-unit 1 paise → max 100
        lotSize: 1,
      }),
    );
    expect(result.status).toBe("allowed");
    if (result.status !== "allowed") throw new Error("expected allowed");
    expect(result.riskPerUnitPaise).toBe(1);
    expect(result.quantity).toBe(100);
  });

  it("handles large capital (₹100 crore at 0.5% risk)", () => {
    const result = decidePosition(
      input({
        capitalPaise: 1_000_000_000_00, // ₹100,00,00,000
        riskBps: 50, // budget 500_000_000 (₹50,00,000)
        entryPaise: 100_000, // ₹1,000
        stopPaise: 99_000, // per-unit 1_000 → max 500_000
        lotSize: 1,
      }),
    );
    expect(result.status).toBe("allowed");
    if (result.status !== "allowed") throw new Error("expected allowed");
    expect(result.riskBudgetPaise).toBe(500_000_000);
    expect(result.maxQuantity).toBe(500_000);
  });

  it("handles fractional risk % (0.15%)", () => {
    const result = decidePosition(input({ riskBps: 15 }));
    expect(result.status).toBe("allowed");
    if (result.status !== "allowed") throw new Error("expected allowed");
    // floor(10_000_000 × 15 / 10000) = 15_000
    expect(result.riskBudgetPaise).toBe(15_000);
  });
});

describe("decidePosition blocked cases", () => {
  it("blocks a long stop above entry", () => {
    const result = decidePosition(input({ entryPaise: 10_000, stopPaise: 10_500 }));
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("invalid_stop");
    expect(result.riskPerUnitPaise).toBeNull();
  });

  it("blocks a long stop equal to entry", () => {
    const result = decidePosition(input({ entryPaise: 10_000, stopPaise: 10_000 }));
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("invalid_stop");
  });

  it("blocks a short stop below entry", () => {
    const result = decidePosition(
      input({ direction: "short", entryPaise: 20_000, stopPaise: 19_000 }),
    );
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("invalid_stop");
  });

  it("blocks a short stop equal to entry", () => {
    const result = decidePosition(
      input({ direction: "short", entryPaise: 20_000, stopPaise: 20_000 }),
    );
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("invalid_stop");
  });

  it("blocks zero risk and invalid lot size as invalid input", () => {
    for (const bad of [
      input({ riskBps: 0 }),
      input({ capitalPaise: 0 }),
      input({ lotSize: 0 }),
      input({ entryPaise: -5 }),
    ]) {
      const result = decidePosition(bad);
      expect(result.status).toBe("blocked");
      if (result.status !== "blocked") throw new Error("expected blocked");
      expect(result.code).toBe("invalid_input");
    }
  });

  it("blocks a long target at or below entry", () => {
    for (const targetPaise of [10_000, 9_000]) {
      const result = decidePosition(input({ targetPaise }));
      expect(result.status).toBe("blocked");
      if (result.status !== "blocked") throw new Error("expected blocked");
      expect(result.code).toBe("invalid_target");
    }
  });

  it("blocks a short target at or above entry", () => {
    for (const targetPaise of [50_000, 51_000]) {
      const result = decidePosition(
        input({ direction: "short", entryPaise: 50_000, stopPaise: 52_000, targetPaise }),
      );
      expect(result.status).toBe("blocked");
      if (result.status !== "blocked") throw new Error("expected blocked");
      expect(result.code).toBe("invalid_target");
    }
  });

  it("blocks when the budget cannot cover one lot", () => {
    const result = decidePosition(
      input({
        capitalPaise: 50_000, // ₹500
        riskBps: 100, // budget 500
        entryPaise: 10_000,
        stopPaise: 9_000, // one lot of 75 costs 75_000
        lotSize: 75,
      }),
    );
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.code).toBe("too_small_for_one_lot");
    expect(result.maxQuantity).toBe(0);
  });
});

describe("riskGuardFieldsSchema (input boundary)", () => {
  const valid = {
    capital: "100000",
    riskPercent: "2.5",
    direction: "long",
    entry: "100",
    stop: "95",
    lotSize: "1",
    target: "",
  };

  it("accepts valid strings and converts to integer domain input", () => {
    const parsed = riskGuardFieldsSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("expected valid");
    expect(toRiskGuardInput(parsed.data)).toEqual({
      capitalPaise: 10_000_000,
      riskBps: 250,
      direction: "long",
      entryPaise: 10_000,
      stopPaise: 9_500,
      lotSize: 1,
    });
  });

  it("converts an optional target when present", () => {
    const parsed = riskGuardFieldsSchema.safeParse({ ...valid, target: "120" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("expected valid");
    expect(toRiskGuardInput(parsed.data).targetPaise).toBe(12_000);
  });

  it("rejects empty, non-numeric and over-precise values", () => {
    expect(riskGuardFieldsSchema.safeParse({ ...valid, capital: "" }).success).toBe(false);
    expect(riskGuardFieldsSchema.safeParse({ ...valid, entry: "abc" }).success).toBe(false);
    expect(riskGuardFieldsSchema.safeParse({ ...valid, stop: "95.123" }).success).toBe(false);
    expect(riskGuardFieldsSchema.safeParse({ ...valid, riskPercent: "0" }).success).toBe(false);
    expect(riskGuardFieldsSchema.safeParse({ ...valid, direction: "sideways" }).success).toBe(
      false,
    );
    expect(riskGuardFieldsSchema.safeParse({ ...valid, lotSize: "0" }).success).toBe(false);
    expect(riskGuardFieldsSchema.safeParse({ ...valid, lotSize: "7.5" }).success).toBe(false);
  });
});

describe("parseHandoffParams (TradePlan handoff boundary)", () => {
  it("accepts a complete valid handoff", () => {
    expect(
      parseHandoffParams({ direction: "long", entry: "100", stop: "95", target: "110" }),
    ).toEqual({ direction: "long", entry: "100", stop: "95", target: "110" });
  });

  it("accepts a handoff without the optional target", () => {
    expect(parseHandoffParams({ direction: "short", entry: "200", stop: "210" })).toEqual({
      direction: "short",
      entry: "200",
      stop: "210",
    });
  });

  it("drops malformed values instead of trusting them", () => {
    expect(
      parseHandoffParams({ direction: "sideways", entry: "abc", stop: "95.123", target: "" }),
    ).toEqual({});
  });

  it("drops out-of-range values and ignores unknown keys", () => {
    expect(
      parseHandoffParams({
        direction: "long",
        entry: "0",
        stop: "99999999999999",
        thesis: "breakout",
        setupName: "x",
      }),
    ).toEqual({ direction: "long" });
  });

  it("takes the first value when a key repeats", () => {
    expect(parseHandoffParams({ entry: ["100", "999"] })).toEqual({ entry: "100" });
  });
});

describe("numerical trust boundaries (₹100 crore cap, exact budget)", () => {
  it("accepts exactly ₹100 crore at the input boundary", () => {
    const parsed = riskGuardFieldsSchema.safeParse({
      capital: "1000000000",
      riskPercent: "2.5",
      direction: "long",
      entry: "100",
      stop: "95",
      lotSize: "1",
      target: "",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("expected valid");
    expect(parsed.data.capital).toBe(100_000_000_000);
  });

  it("rejects ₹100 crore + ₹0.01 at the input boundary", () => {
    const parsed = riskGuardFieldsSchema.safeParse({
      capital: "1000000000.01",
      riskPercent: "2.5",
      direction: "long",
      entry: "100",
      stop: "95",
      lotSize: "1",
      target: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a representative amount well below the cap", () => {
    const parsed = riskGuardFieldsSchema.safeParse({
      capital: "100000",
      riskPercent: "2.5",
      direction: "long",
      entry: "100",
      stop: "95",
      lotSize: "1",
      target: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects risk 0% and accepts risk 100%", () => {
    const base = {
      capital: "100000",
      direction: "long",
      entry: "100",
      stop: "95",
      lotSize: "1",
      target: "",
    };
    expect(
      riskGuardFieldsSchema.safeParse({ ...base, riskPercent: "0" }).success,
    ).toBe(false);
    const full = riskGuardFieldsSchema.safeParse({ ...base, riskPercent: "100" });
    expect(full.success).toBe(true);
    if (!full.success) throw new Error("expected valid");
    expect(full.data.riskPercent).toBe(10_000);

    const blockedZero = decidePosition(input({ riskBps: 0 }));
    expect(blockedZero.status).toBe("blocked");
    if (blockedZero.status !== "blocked") throw new Error("expected blocked");
    expect(blockedZero.code).toBe("invalid_input");

    const allowedFull = decidePosition(
      input({
        capitalPaise: 10_000_000,
        riskBps: 10_000,
        entryPaise: 10_000,
        stopPaise: 9_000,
        lotSize: 1,
      }),
    );
    expect(allowedFull.status).toBe("allowed");
    if (allowedFull.status !== "allowed") throw new Error("expected allowed");
    expect(allowedFull.riskBudgetPaise).toBe(10_000_000);
  });

  it("computes the exact budget at the ₹100 crore cap (100% risk)", () => {
    const result = decidePosition(
      input({
        capitalPaise: 100_000_000_000,
        riskBps: 10_000,
        entryPaise: 100_000,
        stopPaise: 99_000,
        lotSize: 1,
      }),
    );
    expect(result.status).toBe("allowed");
    if (result.status !== "allowed") throw new Error("expected allowed");
    expect(result.riskBudgetPaise).toBe(100_000_000_000);
  });

  it("computes the exact budget at the cap with fractional risk (99.99%)", () => {
    const result = decidePosition(
      input({
        capitalPaise: 100_000_000_000,
        riskBps: 9_999,
        entryPaise: 100_000,
        stopPaise: 99_000,
        lotSize: 1,
      }),
    );
    expect(result.status).toBe("allowed");
    if (result.status !== "allowed") throw new Error("expected allowed");
    // floor(100_000_000_000 × 9_999 / 10_000) = 99_990_000_000
    expect(result.riskBudgetPaise).toBe(99_990_000_000);
  });

  it("floors correctly one paise below the cap at minimum risk", () => {
    const atCap = decidePosition(
      input({
        capitalPaise: 100_000_000_000,
        riskBps: 1,
        entryPaise: 10_001,
        stopPaise: 10_000,
        lotSize: 1,
      }),
    );
    expect(atCap.status).toBe("allowed");
    if (atCap.status !== "allowed") throw new Error("expected allowed");
    // floor(100_000_000_000 / 10_000) = 10_000_000
    expect(atCap.riskBudgetPaise).toBe(10_000_000);

    const belowCap = decidePosition(
      input({
        capitalPaise: 99_999_999_999,
        riskBps: 1,
        entryPaise: 10_001,
        stopPaise: 10_000,
        lotSize: 1,
      }),
    );
    expect(belowCap.status).toBe("allowed");
    if (belowCap.status !== "allowed") throw new Error("expected allowed");
    // floor(99_999_999_999 / 10_000) = 9_999_999 (not 10_000_000)
    expect(belowCap.riskBudgetPaise).toBe(9_999_999);
  });

  it("regression: exact budget where the old multiply-first formula was off by one paise", () => {
    // Engine-level case above the UI cap (the engine is total over safe ints;
    // the UI cap is enforced in validation). The old
    // Math.floor((capitalPaise * riskBps) / 10_000) evaluated this as
    // 998_900_100_001; the exact floor is 998_900_100_000.
    const result = decidePosition(
      input({
        capitalPaise: 999_000_000_001,
        riskBps: 9_999,
        entryPaise: 100_000,
        stopPaise: 99_000,
        lotSize: 1,
      }),
    );
    expect(result.status).toBe("allowed");
    if (result.status !== "allowed") throw new Error("expected allowed");
    expect(result.riskBudgetPaise).toBe(998_900_100_000);
  });
});
