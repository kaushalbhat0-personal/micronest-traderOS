import { describe, expect, it } from "vitest";

import { runBacktest } from "@/features/strategy-lab/backtester";
import {
  SENSITIVITY_REFERENCE_BPS,
  SENSITIVITY_SLIPPAGE_LEGS,
  runSensitivity,
} from "@/features/strategy-lab/sensitivity";
import type { Bar } from "@/features/strategy-lab/types";
import type { StrategyDecision, StrategyEvaluate } from "@/features/strategy-lab/strategy";

function bar(date: string, open: number, high: number, low: number, close: number): Bar {
  return {
    date,
    symbol: "DEMO",
    openPaise: open,
    highPaise: high,
    lowPaise: low,
    closePaise: close,
    volume: 1000,
  };
}

const NO_SIGNAL: StrategyDecision = { kind: "no-signal" };

const PARAMS = { fastPeriod: 2, slowPeriod: 3, stopLookback: 2, minBars: 3 };

// d0 signal → d1 entry at 10000 → d2 exit signal → d3 exit at 11000.
const BARS = [
  bar("2026-09-01", 10000, 10100, 9900, 10000),
  bar("2026-09-02", 10000, 10100, 9900, 10050),
  bar("2026-09-03", 11000, 11100, 10900, 11050),
  bar("2026-09-04", 11000, 11100, 10900, 11000),
];

function scripted(decisions: StrategyDecision[]): StrategyEvaluate {
  let calls = 0;
  return (context: { bars: readonly Bar[] }): StrategyDecision => {
    calls += 1;
    void calls;
    return decisions[context.bars.length - 1] ?? NO_SIGNAL;
  };
}

const ENTRY = {
  kind: "entry",
  direction: "long",
  stopPaise: 9000,
  targetPaise: null,
  note: "t",
} as const;
const EXIT = { kind: "exit", note: "t" } as const;

function input() {
  return {
    bars: BARS,
    evaluate: scripted([ENTRY, NO_SIGNAL, EXIT, NO_SIGNAL]),
    params: PARAMS,
    quantity: 1,
    brokeragePaise: 2000,
  };
}

function okOf(
  result: ReturnType<typeof runSensitivity>,
): Extract<ReturnType<typeof runSensitivity>, { status: "ok" }> {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") {
    throw new Error("expected ok sensitivity result");
  }
  return result;
}

describe("leg coverage and ordering", () => {
  it("runs exactly the locked 0/5/10 legs in deterministic order with 5 as reference", () => {
    expect([...SENSITIVITY_SLIPPAGE_LEGS]).toEqual([0, 5, 10]);
    expect(SENSITIVITY_REFERENCE_BPS).toBe(5);
    const result = okOf(runSensitivity(input()));
    expect(result.legs).toHaveLength(3);
    expect(result.legs.map((leg) => leg.slippageBps)).toEqual([0, 5, 10]);
    expect(result.referenceBps).toBe(5);
  });
});

describe("identical research inputs, only slippage changes", () => {
  it("shares dataset, strategy, params, quantity, and costs across legs", () => {
    const seen: Array<{ length: number; params: unknown }> = [];
    const observing: StrategyEvaluate = (context) => {
      seen.push({ length: context.bars.length, params: context.params });
      return scripted([ENTRY, NO_SIGNAL, EXIT, NO_SIGNAL])(context);
    };
    expect(runSensitivity({ ...input(), evaluate: observing }).status).toBe("ok");
    // 4 closes × 3 legs, every leg walking the same 1..4 window growth.
    expect(seen.map((s) => s.length)).toEqual([1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]);
    expect(seen.every((s) => JSON.stringify(s.params) === JSON.stringify(PARAMS))).toBe(true);
  });

  it("keeps raw prices and trade structure identical while fills differ", () => {
    const result = okOf(runSensitivity(input()));
    const [zeroLeg, fiveLeg, tenLeg] = result.legs;
    for (const leg of [zeroLeg, fiveLeg, tenLeg]) {
      if (leg.result.status !== "ok") {
        throw new Error("expected ok leg");
      }
      expect(leg.result.trades).toHaveLength(1);
    }
    if (
      zeroLeg.result.status !== "ok" ||
      fiveLeg.result.status !== "ok" ||
      tenLeg.result.status !== "ok"
    ) {
      throw new Error("expected ok legs");
    }
    const z = zeroLeg.result.trades[0] as (typeof zeroLeg.result.trades)[number];
    const f = fiveLeg.result.trades[0] as (typeof zeroLeg.result.trades)[number];
    const t = tenLeg.result.trades[0] as (typeof zeroLeg.result.trades)[number];
    // Raw execution prices untouched by slippage.
    expect([f.entryRawPricePaise, t.entryRawPricePaise]).toEqual([
      z.entryRawPricePaise,
      z.entryRawPricePaise,
    ]);
    expect([f.exitRawPricePaise, t.exitRawPricePaise]).toEqual([
      z.exitRawPricePaise,
      z.exitRawPricePaise,
    ]);
    // Fills diverge exactly by the locked legs.
    expect(z.entrySlippagePaise).toBe(0);
    expect(f.entrySlippagePaise).toBe(5);
    expect(t.entrySlippagePaise).toBe(10);
  });
});

describe("backtester delegation and result preservation", () => {
  it("equals three direct M1-C runs and preserves complete trade detail", () => {
    const shared = input();
    const result = okOf(runSensitivity(shared));
    for (const leg of result.legs) {
      const direct = runBacktest({ ...shared, slippageBps: leg.slippageBps });
      expect(JSON.stringify(leg.result)).toBe(JSON.stringify(direct));
      if (leg.result.status !== "ok") {
        throw new Error("expected ok leg");
      }
      expect(leg.result.trades).toHaveLength(1);
      expect(
        Object.keys(leg.result.trades[0] as unknown as Record<string, unknown>).sort(),
      ).toEqual(
        [
          "buyStatutoryPaise",
          "entryDate",
          "entryFillPricePaise",
          "entryRawPricePaise",
          "entrySlippagePaise",
          "exitDate",
          "exitFillPricePaise",
          "exitRawPricePaise",
          "exitReason",
          "exitSlippagePaise",
          "forcedExitAtEnd",
          "grossPnlPaise",
          "netPnlPaise",
          "quantity",
          "sellStatutoryPaise",
        ].sort(),
      );
    }
  });

  it("propagates invalid runs with leg-tagged errors", () => {
    const result = runSensitivity({ ...input(), quantity: 0 });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.every((e) => e.field.startsWith("leg["))).toBe(true);
    }
  });
});

describe("determinism and economic sanity", () => {
  it("produces byte-identical results for identical input", () => {
    const first = runSensitivity(input());
    const second = runSensitivity(input());
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("shows slippage friction without double-deducting it", () => {
    const result = okOf(runSensitivity(input()));
    const nets = result.legs.map((leg) => {
      if (leg.result.status !== "ok") {
        throw new Error("expected ok leg");
      }
      return leg.result.trades[0] as {
        netPnlPaise: number;
        grossPnlPaise: number;
        entrySlippagePaise: number;
        exitSlippagePaise: number;
        entryRawPricePaise: number;
        exitRawPricePaise: number;
        quantity: number;
      };
    });
    // Friction is visible across legs on this large-enough trade.
    expect(new Set(nets.map((n) => n.netPnlPaise)).size).toBe(3);
    // And the M1-C identity still holds per leg: nothing subtracted twice.
    for (const n of nets) {
      const before = (n.exitRawPricePaise - n.entryRawPricePaise) * n.quantity;
      expect(before - n.grossPnlPaise).toBe(
        (n.entrySlippagePaise + n.exitSlippagePaise) * n.quantity,
      );
    }
  });
});
