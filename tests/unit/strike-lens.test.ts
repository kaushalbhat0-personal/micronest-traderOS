import { describe, expect, it } from "vitest";

import {
  compareStrikes,
  distanceBpsFor,
  parseRupeesToPaise,
  STRIKE_LENS_FORMULA_ID,
  STRIKE_LENS_MAX_PAISE,
  type StrikeLensInput,
  type StrikeLensResult,
  type StrikeLensRowInput,
  type StrikeLensRowResult,
} from "@/features/strike-lens/strike-lens";
import {
  parseHandoffParams,
  strikeLensFieldsSchema,
  toStrikeLensInput,
} from "@/features/strike-lens/validation";

function rows(raw: Array<[number, number]>): StrikeLensRowInput[] {
  return raw.map(([strikePaise, premiumPaise]) => ({ strikePaise, premiumPaise }));
}

function input(overrides: Partial<StrikeLensInput> = {}): StrikeLensInput {
  return {
    spotPaise: 10_000, // ₹100
    optionType: "call",
    rows: rows([[9_500, 800]]),
    ...overrides,
  };
}

/** Indexed access with a loud failure instead of an unchecked undefined. */
function rowAt(result: StrikeLensResult, index: number): StrikeLensRowResult {
  if (result.status !== "compared") throw new Error("expected a compared result");
  const row = result.rows[index];
  if (row === undefined) throw new Error(`expected row ${index}`);
  return row;
}

describe("parseRupeesToPaise", () => {
  it("converts exact decimals to integer paise", () => {
    expect(parseRupeesToPaise("123.45")).toBe(12_345);
    expect(parseRupeesToPaise("100")).toBe(10_000);
    expect(parseRupeesToPaise("0.07")).toBe(7);
  });

  it("accepts Indian digit grouping", () => {
    expect(parseRupeesToPaise("1,00,000")).toBe(10_000_000);
  });

  it("rejects values that lose precision or are not plain decimals", () => {
    expect(parseRupeesToPaise("12.345")).toBeNull();
    expect(parseRupeesToPaise("abc")).toBeNull();
    expect(parseRupeesToPaise("")).toBeNull();
    expect(parseRupeesToPaise("-10")).toBeNull();
  });
});

describe("moneyness", () => {
  it("classifies a CE strike below spot as ITM", () => {
    const result = compareStrikes(input());
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).moneyness).toBe("ITM");
  });

  it("classifies exact spot-strike equality as ATM for CE", () => {
    const result = compareStrikes(input({ rows: rows([[10_000, 500]]) }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).moneyness).toBe("ATM");
  });

  it("classifies a CE strike above spot as OTM", () => {
    const result = compareStrikes(input({ rows: rows([[10_500, 300]]) }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).moneyness).toBe("OTM");
  });

  it("classifies a PE strike above spot as ITM", () => {
    const result = compareStrikes(input({ optionType: "put", rows: rows([[10_500, 800]]) }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).moneyness).toBe("ITM");
  });

  it("classifies exact spot-strike equality as ATM for PE", () => {
    const result = compareStrikes(input({ optionType: "put", rows: rows([[10_000, 500]]) }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).moneyness).toBe("ATM");
  });

  it("classifies a PE strike below spot as OTM", () => {
    const result = compareStrikes(input({ optionType: "put", rows: rows([[9_500, 300]]) }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).moneyness).toBe("OTM");
  });

  it("treats one paise below spot as ITM for CE, not ATM", () => {
    const result = compareStrikes(input({ rows: rows([[9_999, 500]]) }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).moneyness).toBe("ITM");
  });

  it("treats one paise above spot as OTM for CE, not ATM", () => {
    const result = compareStrikes(input({ rows: rows([[10_001, 500]]) }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).moneyness).toBe("OTM");
  });
});

describe("nearest-to-spot", () => {
  it("marks the row with minimum absolute distance", () => {
    const result = compareStrikes(
      input({
        rows: rows([
          [9_500, 800],
          [10_200, 400],
          [11_000, 100],
        ]),
      }),
    );
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(result.rows.map((row) => row.strikePaise)).toEqual([9_500, 10_200, 11_000]);
    expect(rowAt(result, 1).isNearestToSpot).toBe(true);
    expect(rowAt(result, 0).isNearestToSpot).toBe(false);
    expect(rowAt(result, 2).isNearestToSpot).toBe(false);
  });

  it("resolves an exact tie to the lower strike", () => {
    const result = compareStrikes(
      input({
        rows: rows([
          [10_500, 300],
          [9_500, 800],
        ]),
      }),
    );
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).strikePaise).toBe(9_500);
    expect(rowAt(result, 0).isNearestToSpot).toBe(true);
    expect(rowAt(result, 1).isNearestToSpot).toBe(false);
  });
});

describe("intrinsic and extrinsic value", () => {
  it("computes CE intrinsic as max(spot − strike, 0)", () => {
    const result = compareStrikes(input());
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    // spot ₹100, strike ₹95 → ₹5 intrinsic.
    expect(rowAt(result, 0).intrinsicPaise).toBe(500);
  });

  it("computes PE intrinsic as max(strike − spot, 0)", () => {
    const result = compareStrikes(input({ optionType: "put", rows: rows([[10_500, 800]]) }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).intrinsicPaise).toBe(500);
  });

  it("computes extrinsic as premium − intrinsic", () => {
    const result = compareStrikes(input());
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    const row = rowAt(result, 0);
    expect(row.status).toBe("ok");
    if (row.status !== "ok") return;
    // premium ₹8 − intrinsic ₹5 → ₹3 extrinsic.
    expect(row.extrinsicPaise).toBe(300);
  });

  it("reports zero extrinsic when premium equals intrinsic", () => {
    const result = compareStrikes(input({ rows: rows([[9_500, 500]]) }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    const row = rowAt(result, 0);
    expect(row.status).toBe("ok");
    if (row.status !== "ok") return;
    expect(row.extrinsicPaise).toBe(0);
  });

  it("returns an inconsistent row when premium is below intrinsic", () => {
    const result = compareStrikes(input({ rows: rows([[9_500, 300]]) }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    const row = rowAt(result, 0);
    expect(row.status).toBe("inconsistent");
    if (row.status !== "inconsistent") return;
    expect(row.extrinsicPaise).toBeNull();
    // The remaining arithmetic stays available.
    expect(row.intrinsicPaise).toBe(500);
    expect(row.moneyness).toBe("ITM");
    expect(row.distancePaise).toBe(-500);
    expect(row.reason).toContain("cannot be negative");
  });

  it("rejects a zero premium as invalid input", () => {
    const result = compareStrikes(input({ rows: rows([[9_500, 0]]) }));
    expect(result.status).toBe("invalid");
  });
});

describe("option breakeven", () => {
  it("computes CE breakeven as strike + premium", () => {
    const result = compareStrikes(input());
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    // ₹95 + ₹8 → ₹103.
    expect(rowAt(result, 0).breakevenPaise).toBe(10_300);
    expect(rowAt(result, 0).breakevenAtOrBelowZero).toBe(false);
  });

  it("computes PE breakeven as strike − premium", () => {
    const result = compareStrikes(input({ optionType: "put", rows: rows([[10_500, 800]]) }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    // ₹105 − ₹8 → ₹97.
    expect(rowAt(result, 0).breakevenPaise).toBe(9_700);
    expect(rowAt(result, 0).breakevenAtOrBelowZero).toBe(false);
  });

  it("flags PE breakeven at or below zero without blocking", () => {
    const result = compareStrikes(input({ optionType: "put", rows: rows([[5_000, 6_000]]) }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).breakevenPaise).toBe(-1_000);
    expect(rowAt(result, 0).breakevenAtOrBelowZero).toBe(true);
    expect(rowAt(result, 0).status).toBe("ok");
  });
});

describe("distance", () => {
  it("reports signed distance strike − spot", () => {
    const result = compareStrikes(input());
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).distancePaise).toBe(-500);
    expect(rowAt(result, 0).absDistancePaise).toBe(500);
  });

  it("reports zero distance and zero basis points at equality", () => {
    const result = compareStrikes(input({ rows: rows([[10_000, 500]]) }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).distancePaise).toBe(0);
    expect(rowAt(result, 0).distanceBps).toBe(0);
  });

  it("rounds percentage distance half-up in integer basis points", () => {
    // |d| = 500 on spot 10000 → exactly 500 bps (5.00%).
    const result = compareStrikes(input());
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(rowAt(result, 0).distanceBps).toBe(500);
    // Exact .5 bps ties round upward: 1 / 20000 × 10000 = 0.5 → 1.
    expect(distanceBpsFor(1, 20_000)).toBe(1);
    expect(distanceBpsFor(1, 40_000)).toBe(0);
  });
});

describe("invalid input", () => {
  it("rejects non-positive spot", () => {
    expect(compareStrikes(input({ spotPaise: 0 })).status).toBe("invalid");
  });

  it("rejects spot above ₹100 crore", () => {
    expect(compareStrikes(input({ spotPaise: STRIKE_LENS_MAX_PAISE + 1 })).status).toBe("invalid");
  });

  it("accepts ₹100 crore exactly", () => {
    const result = compareStrikes(
      input({ spotPaise: STRIKE_LENS_MAX_PAISE, rows: rows([[STRIKE_LENS_MAX_PAISE, 100]]) }),
    );
    expect(result.status).toBe("compared");
  });

  it("rejects duplicate strikes", () => {
    const result = compareStrikes(
      input({
        rows: rows([
          [9_500, 800],
          [9_500, 300],
        ]),
      }),
    );
    expect(result.status).toBe("invalid");
  });

  it("rejects an unknown option type", () => {
    const result = compareStrikes(input({ optionType: "straddle" as unknown as "call" }));
    expect(result.status).toBe("invalid");
  });

  it("rejects an empty row set", () => {
    expect(compareStrikes(input({ rows: [] })).status).toBe("invalid");
  });

  it("rejects more than five rows", () => {
    const six = rows([
      [9_000, 100],
      [9_500, 200],
      [10_000, 300],
      [10_500, 400],
      [11_000, 500],
      [11_500, 600],
    ]);
    expect(compareStrikes(input({ rows: six })).status).toBe("invalid");
  });

  it("accepts one row and five rows", () => {
    const five = rows([
      [9_000, 100],
      [9_500, 200],
      [10_000, 300],
      [10_500, 400],
      [11_000, 500],
    ]);
    expect(compareStrikes(input({ rows: five })).status).toBe("compared");
    expect(compareStrikes(input()).status).toBe("compared");
  });

  it("returns rows in ascending strike order", () => {
    const result = compareStrikes(
      input({
        rows: rows([
          [10_500, 300],
          [9_500, 800],
          [10_000, 500],
        ]),
      }),
    );
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(result.rows.map((row) => row.strikePaise)).toEqual([9_500, 10_000, 10_500]);
    expect(result.formulaId).toBe(STRIKE_LENS_FORMULA_ID);
  });

  it("carries the expiry label through untouched", () => {
    const result = compareStrikes(input({ expiryLabel: "NIFTY 30 OCT" }));
    expect(result.status).toBe("compared");
    if (result.status !== "compared") return;
    expect(result.inputs.expiryLabel).toBe("NIFTY 30 OCT");
  });
});

describe("validation boundary", () => {
  it("parses a valid CE comparison", () => {
    const parsed = strikeLensFieldsSchema.safeParse({
      spot: "100",
      optionType: "call",
      rows: [{ strike: "95", premium: "8" }],
      expiryLabel: "",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(toStrikeLensInput(parsed.data)).toEqual({
      spotPaise: 10_000,
      optionType: "call",
      rows: [{ strikePaise: 9_500, premiumPaise: 800 }],
    });
  });

  it("rejects duplicate strikes at the boundary", () => {
    const parsed = strikeLensFieldsSchema.safeParse({
      spot: "100",
      optionType: "call",
      rows: [
        { strike: "95", premium: "8" },
        { strike: "95", premium: "3" },
      ],
      expiryLabel: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid option type", () => {
    const parsed = strikeLensFieldsSchema.safeParse({
      spot: "100",
      optionType: "straddle",
      rows: [{ strike: "95", premium: "8" }],
      expiryLabel: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects six rows and an over-long expiry label", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      strike: String(90 + i),
      premium: "1",
    }));
    expect(
      strikeLensFieldsSchema.safeParse({
        spot: "100",
        optionType: "call",
        rows: six,
        expiryLabel: "",
      }).success,
    ).toBe(false);
    expect(
      strikeLensFieldsSchema.safeParse({
        spot: "100",
        optionType: "call",
        rows: [{ strike: "95", premium: "8" }],
        expiryLabel: "x".repeat(31),
      }).success,
    ).toBe(false);
  });

  it("rejects values above ₹100 crore", () => {
    expect(
      strikeLensFieldsSchema.safeParse({
        spot: "1000000001",
        optionType: "call",
        rows: [{ strike: "95", premium: "8" }],
        expiryLabel: "",
      }).success,
    ).toBe(false);
  });
});

describe("spot handoff parser", () => {
  it("accepts a valid spot and ignores unknown keys", () => {
    expect(parseHandoffParams({ spot: "100", direction: "long" })).toEqual({ spot: "100" });
  });

  it("omits invalid or absent spot values", () => {
    expect(parseHandoffParams({})).toEqual({});
    expect(parseHandoffParams({ spot: "abc" })).toEqual({});
    expect(parseHandoffParams({ spot: "0" })).toEqual({});
  });
});
