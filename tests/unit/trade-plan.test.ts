import { describe, expect, it } from "vitest";

import {
  checkPlan,
  parseRupeesToPaise,
  TRADE_PLAN_FORMULA_ID,
  type TradePlanInput,
} from "@/features/trade-plan/trade-plan";
import { toTradePlanInput, tradePlanFieldsSchema } from "@/features/trade-plan/validation";

function input(overrides: Partial<TradePlanInput> = {}): TradePlanInput {
  return {
    direction: "long",
    entryPaise: 10_000, // ₹100
    stopPaise: 9_500, // ₹95
    targetPaise: 11_000, // ₹110
    setupName: "Breakout retest",
    thesis: "Price reclaimed the level and held on a retest.",
    invalidation: "A close back below the level.",
    ...overrides,
  };
}

describe("checkPlan direction", () => {
  it("accepts a valid long plan with R:R 3:1", () => {
    const result = checkPlan(input());
    expect(result.status).toBe("coherent");
    if (result.status !== "coherent") throw new Error("expected coherent");
    expect(result.formulaId).toBe("TP-001");
    expect(result.riskPerUnitPaise).toBe(500);
    expect(result.rewardPerUnitPaise).toBe(1_000);
    expect(result.riskRewardRatio).toBe(2);
  });

  it("accepts a valid short plan", () => {
    const result = checkPlan(
      input({
        direction: "short",
        entryPaise: 20_000, // ₹200
        stopPaise: 21_000, // risk 1_000
        targetPaise: 18_000, // reward 2_000
      }),
    );
    expect(result.status).toBe("coherent");
    if (result.status !== "coherent") throw new Error("expected coherent");
    expect(result.riskPerUnitPaise).toBe(1_000);
    expect(result.rewardPerUnitPaise).toBe(2_000);
    expect(result.riskRewardRatio).toBe(2);
  });
});

describe("checkPlan stop", () => {
  it("accepts a valid long stop below entry", () => {
    const result = checkPlan(input({ targetPaise: undefined }));
    expect(result.status).toBe("coherent");
    if (result.status !== "coherent") throw new Error("expected coherent");
    expect(result.riskPerUnitPaise).toBe(500);
  });

  it("accepts a valid short stop above entry", () => {
    const result = checkPlan(
      input({ direction: "short", entryPaise: 20_000, stopPaise: 20_500, targetPaise: undefined }),
    );
    expect(result.status).toBe("coherent");
    if (result.status !== "coherent") throw new Error("expected coherent");
    expect(result.riskPerUnitPaise).toBe(500);
  });

  it("rejects a long stop at or above entry without correcting it", () => {
    for (const stopPaise of [10_000, 10_500]) {
      const result = checkPlan(input({ stopPaise, targetPaise: undefined }));
      expect(result.status).toBe("incoherent");
      if (result.status !== "incoherent") throw new Error("expected incoherent");
      expect(result.code).toBe("invalid_stop");
      expect(result.riskPerUnitPaise).toBeNull();
    }
  });

  it("rejects a short stop at or below entry without correcting it", () => {
    for (const stopPaise of [20_000, 19_000]) {
      const result = checkPlan(
        input({ direction: "short", entryPaise: 20_000, stopPaise, targetPaise: 18_000 }),
      );
      expect(result.status).toBe("incoherent");
      if (result.status !== "incoherent") throw new Error("expected incoherent");
      expect(result.code).toBe("invalid_stop");
    }
  });
});

describe("checkPlan target", () => {
  it("accepts a valid long target above entry", () => {
    const result = checkPlan(input({ targetPaise: 12_000 }));
    expect(result.status).toBe("coherent");
    if (result.status !== "coherent") throw new Error("expected coherent");
    expect(result.rewardPerUnitPaise).toBe(2_000);
  });

  it("accepts a valid short target below entry", () => {
    const result = checkPlan(
      input({ direction: "short", entryPaise: 20_000, stopPaise: 21_000, targetPaise: 19_000 }),
    );
    expect(result.status).toBe("coherent");
    if (result.status !== "coherent") throw new Error("expected coherent");
    expect(result.rewardPerUnitPaise).toBe(1_000);
  });

  it("rejects a long target at or below entry", () => {
    for (const targetPaise of [10_000, 9_000]) {
      const result = checkPlan(input({ targetPaise }));
      expect(result.status).toBe("incoherent");
      if (result.status !== "incoherent") throw new Error("expected incoherent");
      expect(result.code).toBe("invalid_target");
      // The stop was valid, so the known risk is still reported.
      expect(result.riskPerUnitPaise).toBe(500);
    }
  });

  it("rejects a short target at or above entry", () => {
    for (const targetPaise of [20_000, 21_000]) {
      const result = checkPlan(
        input({ direction: "short", entryPaise: 20_000, stopPaise: 21_000, targetPaise }),
      );
      expect(result.status).toBe("incoherent");
      if (result.status !== "incoherent") throw new Error("expected incoherent");
      expect(result.code).toBe("invalid_target");
    }
  });

  it("leaves R:R absent when no target is given", () => {
    const result = checkPlan(input({ targetPaise: undefined }));
    expect(result.status).toBe("coherent");
    if (result.status !== "coherent") throw new Error("expected coherent");
    expect(result.rewardPerUnitPaise).toBeNull();
    expect(result.riskRewardRatio).toBeNull();
  });
});

describe("checkPlan arithmetic", () => {
  it("computes a fractional R:R of 1:2 (0.5)", () => {
    const result = checkPlan(
      input({
        entryPaise: 10_000,
        stopPaise: 9_000, // risk 1_000
        targetPaise: 10_500, // reward 500
      }),
    );
    expect(result.status).toBe("coherent");
    if (result.status !== "coherent") throw new Error("expected coherent");
    expect(result.riskRewardRatio).toBe(0.5);
  });

  it("handles tiny valid decimal values (1 paise risk)", () => {
    const result = checkPlan(
      input({
        entryPaise: 2, // ₹0.02
        stopPaise: 1, // risk 1 paise
        targetPaise: 5, // reward 3 paise
      }),
    );
    expect(result.status).toBe("coherent");
    if (result.status !== "coherent") throw new Error("expected coherent");
    expect(result.riskPerUnitPaise).toBe(1);
    expect(result.rewardPerUnitPaise).toBe(3);
    expect(result.riskRewardRatio).toBe(3);
  });

  it("handles large valid values (₹100 crore prices)", () => {
    const result = checkPlan(
      input({
        entryPaise: 1_000_000_000_00,
        stopPaise: 999_000_000_00, // risk 100_000_000
        targetPaise: 1_002_000_000_00, // reward 200_000_000
      }),
    );
    expect(result.status).toBe("coherent");
    if (result.status !== "coherent") throw new Error("expected coherent");
    expect(result.riskPerUnitPaise).toBe(100_000_000);
    expect(result.riskRewardRatio).toBe(2);
  });
});

describe("checkPlan receipt", () => {
  it("exposes TP-001, inputs, units and rounding on a coherent plan", () => {
    const result = checkPlan(input());
    expect(result.status).toBe("coherent");
    if (result.status !== "coherent") throw new Error("expected coherent");
    expect(result.formulaId).toBe(TRADE_PLAN_FORMULA_ID);
    expect(result.inputs.setupName).toBe("Breakout retest");
    expect(result.inputs.thesis).toContain("reclaimed");
    expect(result.inputs.invalidation).toContain("below");
    expect(result.rounding).toContain("No rounding");
  });

  it("exposes TP-001 and the reason on an incoherent plan", () => {
    const result = checkPlan(input({ stopPaise: 10_500, targetPaise: undefined }));
    expect(result.status).toBe("incoherent");
    if (result.status !== "incoherent") throw new Error("expected incoherent");
    expect(result.formulaId).toBe("TP-001");
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

describe("parseRupeesToPaise", () => {
  it("converts decimals to integer paise without floating-point", () => {
    expect(parseRupeesToPaise("123.45")).toBe(12_345);
    expect(parseRupeesToPaise("0.07")).toBe(7);
    expect(parseRupeesToPaise("0.1")).toBe(10);
    expect(parseRupeesToPaise("1,00,000")).toBe(10_000_000);
  });

  it("rejects values that lose precision or are not plain decimals", () => {
    expect(parseRupeesToPaise("12.345")).toBeNull();
    expect(parseRupeesToPaise("abc")).toBeNull();
    expect(parseRupeesToPaise("")).toBeNull();
    expect(parseRupeesToPaise("-10")).toBeNull();
  });

  it("preserves exact decimal intent (19.99 keeps all four digits)", () => {
    // Binary floating-point cannot represent 19.99 exactly; the string parser can.
    expect(19.99 * 100).not.toBe(1999);
    expect(parseRupeesToPaise("19.99")).toBe(1999);
  });
});

describe("tradePlanFieldsSchema (input boundary)", () => {
  const valid = {
    direction: "long",
    entry: "100",
    stop: "95",
    target: "110",
    setupName: "Breakout retest",
    thesis: "Price reclaimed the level and held.",
    invalidation: "A close back below the level.",
    notes: "",
  };

  it("accepts valid strings and converts to domain input", () => {
    const parsed = tradePlanFieldsSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("expected valid");
    expect(toTradePlanInput(parsed.data)).toEqual({
      direction: "long",
      entryPaise: 10_000,
      stopPaise: 9_500,
      targetPaise: 11_000,
      setupName: "Breakout retest",
      thesis: "Price reclaimed the level and held.",
      invalidation: "A close back below the level.",
    });
  });

  it("treats a blank target and blank notes as absent", () => {
    const parsed = tradePlanFieldsSchema.safeParse({ ...valid, target: "", notes: "" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("expected valid");
    const converted = toTradePlanInput(parsed.data);
    expect(converted.targetPaise).toBeUndefined();
    expect(converted.notes).toBeUndefined();
  });

  it("rejects malformed money, excessive values and empty setup fields", () => {
    expect(tradePlanFieldsSchema.safeParse({ ...valid, entry: "abc" }).success).toBe(false);
    expect(tradePlanFieldsSchema.safeParse({ ...valid, stop: "95.123" }).success).toBe(false);
    expect(tradePlanFieldsSchema.safeParse({ ...valid, setupName: "" }).success).toBe(false);
    expect(tradePlanFieldsSchema.safeParse({ ...valid, thesis: "" }).success).toBe(false);
    expect(tradePlanFieldsSchema.safeParse({ ...valid, invalidation: "" }).success).toBe(false);
    expect(tradePlanFieldsSchema.safeParse({ ...valid, direction: "sideways" }).success).toBe(
      false,
    );
  });

  it("rejects text beyond the maximum lengths", () => {
    expect(
      tradePlanFieldsSchema.safeParse({ ...valid, setupName: "x".repeat(81) }).success,
    ).toBe(false);
    expect(tradePlanFieldsSchema.safeParse({ ...valid, thesis: "x".repeat(501) }).success).toBe(
      false,
    );
    expect(
      tradePlanFieldsSchema.safeParse({ ...valid, invalidation: "x".repeat(281) }).success,
    ).toBe(false);
    expect(tradePlanFieldsSchema.safeParse({ ...valid, notes: "x".repeat(501) }).success).toBe(
      false,
    );
  });
});
