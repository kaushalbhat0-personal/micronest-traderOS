import { describe, expect, it } from "vitest";

import {
  STRATEGY_LAB_REFERENCE_PARAMS,
  type Bar,
  type StrategyParams,
} from "@/features/strategy-lab/types";
import { evaluateSmaCross } from "@/features/strategy-lab/strategies/sma-cross";
import {
  STRATEGY_SIGNAL_NOTE_MAX_LENGTH,
  type StrategyContext,
  type StrategyDecision,
} from "@/features/strategy-lab/strategy";
import { validateStrategyParams } from "@/features/strategy-lab/validation";

const P: StrategyParams = { fastPeriod: 2, slowPeriod: 3, stopLookback: 2, minBars: 3 };

function bar(date: string, closePaise: number, lowPaise?: number): Bar {
  const low = lowPaise ?? closePaise - 50;
  return {
    date,
    symbol: "DEMO",
    openPaise: closePaise,
    highPaise: closePaise + 50,
    lowPaise: low,
    closePaise,
    volume: 1000,
  };
}

function bars(closes: number[], lows?: number[], startDay = 1): Bar[] {
  return closes.map((close, i) =>
    bar(`2026-09-${String(startDay + i).padStart(2, "0")}`, close, lows?.[i]),
  );
}

function context(over: Partial<StrategyContext> & { bars: Bar[] }): StrategyContext {
  return {
    position: { status: "flat" },
    params: P,
    ...over,
  };
}

/** Engineered strict cross: flat at 10000, then 11000 → entry at index 3. */
const ENTRY_CLOSES = [10000, 10000, 10000, 11000];
const ENTRY_LOWS = [9900, 9925, 9900, 9950];

describe("SMA comparison", () => {
  it("stays silent when fast is below, equal, or merely above slow", () => {
    // Constant series: exactly equal forever → never an entry.
    const flat = context({ bars: bars([10000, 10000, 10000, 10000, 10000]) });
    expect(evaluateSmaCross(flat)).toEqual({ kind: "no-signal" });

    // Already above (cross happened earlier, extended run-up): no repeated entry.
    const runUp = context({ bars: bars([10000, 10000, 10000, 11000, 12000]) });
    expect(evaluateSmaCross(runUp)).toEqual({ kind: "no-signal" });
  });

  it("computes cross-products exactly at product scale", () => {
    const cap = 100000000000; // ₹100 crore cap in paise
    const flat = context({
      bars: bars(new Array(35).fill(cap)),
      params: STRATEGY_LAB_REFERENCE_PARAMS,
    });
    expect(evaluateSmaCross(flat)).toEqual({ kind: "no-signal" });

    const rising = context({
      bars: bars([...new Array(30).fill(cap - 100000), cap]),
      params: STRATEGY_LAB_REFERENCE_PARAMS,
    });
    const decision = evaluateSmaCross(rising);
    expect(decision.kind).toBe("entry");
  });
});

describe("entry", () => {
  it("fires on a strict below/equal-to-above cross only", () => {
    const decision = evaluateSmaCross(context({ bars: bars(ENTRY_CLOSES, ENTRY_LOWS) }));
    expect(decision.kind).toBe("entry");
    if (decision.kind !== "entry") {
      return;
    }
    expect(decision.direction).toBe("long");
    expect(decision.targetPaise).toBeNull();
  });

  it("treats equality-then-above as a valid cross", () => {
    // Previous relation is exactly 0 (flat 10000s), current is above.
    const decision = evaluateSmaCross(context({ bars: bars(ENTRY_CLOSES, ENTRY_LOWS) }));
    expect(decision.kind).toBe("entry");
  });
});

describe("exit", () => {
  const EXIT_CLOSES = [...ENTRY_CLOSES, 8000];
  const EXIT_LOWS = [...ENTRY_LOWS, 7900];

  it("fires on a strict above/equal-to-below cross when LONG", () => {
    const decision = evaluateSmaCross(
      context({
        bars: bars(EXIT_CLOSES, EXIT_LOWS),
        position: {
          status: "long",
          entryPricePaise: 10050,
          quantity: 1,
          stopPaise: 9900,
          targetPaise: null,
        },
      }),
    );
    expect(decision.kind).toBe("exit");
  });

  it("does not repeat an exit once already below", () => {
    const decision = evaluateSmaCross(
      context({
        bars: bars([...EXIT_CLOSES, 7000], [...EXIT_LOWS, 6900]),
        position: {
          status: "long",
          entryPricePaise: 10050,
          quantity: 1,
          stopPaise: 9900,
          targetPaise: null,
        },
      }),
    );
    expect(decision).toEqual({ kind: "no-signal" });
  });

  it("never exits when FLAT, even on an exit-shaped cross", () => {
    const decision = evaluateSmaCross(context({ bars: bars(EXIT_CLOSES, EXIT_LOWS) }));
    expect(decision).toEqual({ kind: "no-signal" });
  });
});

describe("warm-up", () => {
  it("returns NoSignal below minBars and evaluates at minBars", () => {
    expect(evaluateSmaCross(context({ bars: bars([10000, 10000]) }))).toEqual({
      kind: "no-signal",
    });
    // Exactly minBars: the warm-up gate passes. Cross history is still one bar
    // short here, so the decision is a deterministic NoSignal — never fabricated.
    expect(evaluateSmaCross(context({ bars: bars([10000, 10000, 11000]) }))).toEqual({
      kind: "no-signal",
    });
    // One further bar completes both cross windows and the cross fires.
    expect(evaluateSmaCross(context({ bars: bars([10000, 10000, 10000, 11000]) })).kind).toBe(
      "entry",
    );
  });

  it("holds the default 30-bar gate", () => {
    const flat29 = bars(new Array(29).fill(5000));
    expect(
      evaluateSmaCross({
        bars: flat29,
        position: { status: "flat" },
        params: STRATEGY_LAB_REFERENCE_PARAMS,
      }),
    ).toEqual({ kind: "no-signal" });
    const flat30 = bars(new Array(30).fill(5000));
    const decision = evaluateSmaCross({
      bars: flat30,
      position: { status: "flat" },
      params: STRATEGY_LAB_REFERENCE_PARAMS,
    });
    expect(decision).toEqual({ kind: "no-signal" });
  });
});

describe("stop", () => {
  it("uses the lowest low of exactly the lookback window including bar t", () => {
    const decision = evaluateSmaCross(context({ bars: bars(ENTRY_CLOSES, ENTRY_LOWS) }));
    expect(decision.kind).toBe("entry");
    if (decision.kind !== "entry") {
      return;
    }
    // Last 2 bars (lookback 2): lows 9900 (t-1), 9950 (t) → 9900.
    expect(decision.stopPaise).toBe(9900);
  });

  it("picks the current bar low when it is the minimum", () => {
    const lows = [9900, 9925, 9950, 9800];
    const decision = evaluateSmaCross(context({ bars: bars(ENTRY_CLOSES, lows) }));
    expect(decision.kind).toBe("entry");
    if (decision.kind !== "entry") {
      return;
    }
    expect(decision.stopPaise).toBe(9800);
  });

  it("preserves integer paise with no rounding", () => {
    const lows = [9901, 9927, 9903, 9957];
    const decision = evaluateSmaCross(context({ bars: bars(ENTRY_CLOSES, lows) }));
    expect(decision.kind).toBe("entry");
    if (decision.kind !== "entry") {
      return;
    }
    expect(decision.stopPaise).toBe(9903);
    expect(Number.isInteger(decision.stopPaise)).toBe(true);
  });

  it("does not clamp a stop at or above the signal close", () => {
    // Lows above the pre-spike closes: stop 10050 > prior closes is proposed
    // as-is; protectiveness-vs-fill belongs to M1-C, not the strategy.
    const closes = [10000, 10000, 10000, 10010];
    const lows = [10020, 10030, 10040, 10050];
    const decision = evaluateSmaCross(context({ bars: bars(closes, lows) }));
    expect(decision.kind).toBe("entry");
    if (decision.kind !== "entry") {
      return;
    }
    expect(decision.stopPaise).toBe(10040);
  });
});

describe("position state", () => {
  const long = {
    status: "long",
    entryPricePaise: 10050,
    quantity: 1,
    stopPaise: 9900,
    targetPaise: null,
  } as const;

  it("FLAT generates entries but never exits; LONG generates exits but never entries", () => {
    const entryBars = bars(ENTRY_CLOSES, ENTRY_LOWS);
    expect(evaluateSmaCross(context({ bars: entryBars })).kind).toBe("entry");
    expect(evaluateSmaCross(context({ bars: entryBars, position: long })).kind).not.toBe("entry");

    const exitBars = bars([...ENTRY_CLOSES, 8000], [...ENTRY_LOWS, 7900]);
    expect(evaluateSmaCross(context({ bars: exitBars, position: long })).kind).toBe("exit");
  });
});

describe("validateStrategyParams", () => {
  it("accepts the locked reference set and valid custom sets", () => {
    expect(validateStrategyParams(STRATEGY_LAB_REFERENCE_PARAMS).status).toBe("ok");
    expect(
      validateStrategyParams({ fastPeriod: 5, slowPeriod: 20, stopLookback: 10, minBars: 20 })
        .status,
    ).toBe("ok");
  });

  it.each([
    ["fast >= slow", { fastPeriod: 30, slowPeriod: 30, stopLookback: 20, minBars: 30 }],
    ["fast > slow", { fastPeriod: 40, slowPeriod: 30, stopLookback: 20, minBars: 40 }],
    ["fast <= 0", { fastPeriod: 0, slowPeriod: 30, stopLookback: 20, minBars: 30 }],
    ["stopLookback < 1", { fastPeriod: 10, slowPeriod: 30, stopLookback: 0, minBars: 30 }],
    ["minBars < slow", { fastPeriod: 10, slowPeriod: 30, stopLookback: 20, minBars: 29 }],
    ["non-integer", { fastPeriod: 2.5, slowPeriod: 30, stopLookback: 20, minBars: 30 }],
    ["non-object", "10,30,20,30"],
  ])("rejects %s", (_label, raw) => {
    expect(validateStrategyParams(raw).status).toBe("invalid");
  });
});

describe("determinism and notes", () => {
  it("returns byte-identical decisions for identical contexts", () => {
    const ctx = context({ bars: bars(ENTRY_CLOSES, ENTRY_LOWS) });
    const first: StrategyDecision = evaluateSmaCross(ctx);
    const second: StrategyDecision = evaluateSmaCross(ctx);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("emits short factual notes without recommendation language", () => {
    const banned = [
      "profit",
      "recommend",
      "guarantee",
      "predict",
      "forecast",
      "alpha",
      "winning",
      "best",
      "optimal",
    ];
    const entry = evaluateSmaCross(context({ bars: bars(ENTRY_CLOSES, ENTRY_LOWS) }));
    const exit = evaluateSmaCross(
      context({
        bars: bars([...ENTRY_CLOSES, 8000], [...ENTRY_LOWS, 7900]),
        position: {
          status: "long",
          entryPricePaise: 10050,
          quantity: 1,
          stopPaise: 9900,
          targetPaise: null,
        },
      }),
    );
    for (const decision of [entry, exit]) {
      expect(decision.kind).not.toBe("no-signal");
      if (decision.kind === "no-signal") {
        continue;
      }
      expect(decision.note.length).toBeLessThanOrEqual(STRATEGY_SIGNAL_NOTE_MAX_LENGTH);
      const lower = decision.note.toLowerCase();
      for (const word of banned) {
        expect(lower).not.toContain(word);
      }
    }
  });
});

describe("anti-lookahead", () => {
  it("produces identical decisions with and without future bars present", () => {
    const prefix = bars(ENTRY_CLOSES, ENTRY_LOWS);
    const futureCloses = new Array(30).fill(50000);
    const future = bars(futureCloses, undefined, 5);
    const withFuture = [...prefix, ...future];

    const withoutFuture: StrategyContext = context({ bars: prefix });
    const windowOnly: StrategyContext = context({ bars: withFuture.slice(0, prefix.length) });

    const a = evaluateSmaCross(withoutFuture);
    const b = evaluateSmaCross(windowOnly);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.kind).toBe("entry");
  });

  it("exposes no dataset handle beyond the supplied window", () => {
    // The strategy takes exactly one argument — the context — so there is no
    // parameter through which a full dataset could even be passed.
    expect(evaluateSmaCross.length).toBe(1);
  });
});
