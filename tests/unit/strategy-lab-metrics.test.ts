import { describe, expect, it } from "vitest";

import { runBacktest } from "@/features/strategy-lab/backtester";
import {
  RESEARCH_SPLIT_DATE,
  RESEARCH_SPLIT_ID,
  analyzeResearch,
  classifyTradePartition,
  type ResearchResult,
} from "@/features/strategy-lab/metrics";
import { runSensitivity } from "@/features/strategy-lab/sensitivity";
import type { BacktestTrade } from "@/features/strategy-lab/backtester";
import type { Bar } from "@/features/strategy-lab/types";
import type { SensitivityResult } from "@/features/strategy-lab/sensitivity";
import type { StrategyDecision, StrategyEvaluate } from "@/features/strategy-lab/strategy";

function trade(over: Partial<BacktestTrade> & { entryDate: string; net: number }): BacktestTrade {
  const gross = over.grossPnlPaise ?? over.net;
  return {
    entryDate: over.entryDate,
    exitDate: over.exitDate ?? over.entryDate,
    quantity: over.quantity ?? 1,
    entryRawPricePaise: over.entryRawPricePaise ?? 10000,
    exitRawPricePaise: over.exitRawPricePaise ?? 10100,
    entryFillPricePaise: over.entryFillPricePaise ?? 10000,
    exitFillPricePaise: over.exitFillPricePaise ?? 10100,
    entrySlippagePaise: over.entrySlippagePaise ?? 0,
    exitSlippagePaise: over.exitSlippagePaise ?? 0,
    buyStatutoryPaise: over.buyStatutoryPaise ?? 0,
    sellStatutoryPaise: over.sellStatutoryPaise ?? 0,
    grossPnlPaise: gross,
    netPnlPaise: over.net,
    exitReason: over.exitReason ?? "signal",
    forcedExitAtEnd: over.forcedExitAtEnd ?? false,
  };
}

function analyze(trades: BacktestTrade[]): Extract<ResearchResult, { status: "ok" }> {
  const legs: SensitivityResult = {
    status: "ok",
    referenceBps: 5,
    legs: [
      {
        slippageBps: 0,
        result: {
          status: "ok",
          trades,
          rejectedEntries: [],
          diagnostics: {
            barsProcessed: 1,
            entriesExecuted: 0,
            signalsUnexecutedAtEnd: 0,
            rejectedEntries: 0,
          },
        },
      },
      {
        slippageBps: 5,
        result: {
          status: "ok",
          trades,
          rejectedEntries: [],
          diagnostics: {
            barsProcessed: 1,
            entriesExecuted: 0,
            signalsUnexecutedAtEnd: 0,
            rejectedEntries: 0,
          },
        },
      },
      {
        slippageBps: 10,
        result: {
          status: "ok",
          trades,
          rejectedEntries: [],
          diagnostics: {
            barsProcessed: 1,
            entriesExecuted: 0,
            signalsUnexecutedAtEnd: 0,
            rejectedEntries: 0,
          },
        },
      },
    ],
  };
  const result = analyzeResearch(legs);
  expect(result.status).toBe("ok");
  if (result.status !== "ok") {
    throw new Error("expected ok research");
  }
  return result;
}

describe("frozen split", () => {
  it("locks SLAB-SPLIT-001 at 2026-09-14 with entry-date classification", () => {
    expect(RESEARCH_SPLIT_ID).toBe("SLAB-SPLIT-001");
    expect(RESEARCH_SPLIT_DATE).toBe("2026-09-14");
    expect(classifyTradePartition("2026-09-13")).toBe("is");
    expect(classifyTradePartition("2026-09-14")).toBe("oos");
    expect(classifyTradePartition("2026-09-15")).toBe("oos");
  });

  it("keeps a crossing trade whole in its entry partition", () => {
    const crossing = trade({ entryDate: "2026-09-13", exitDate: "2026-09-16", net: 1000 });
    const result = analyze([crossing]);
    const five = result.legs[1];
    expect(five?.is.tradeCount).toBe(1);
    expect(five?.is.netPnlPaise).toBe(1000);
    expect(five?.oos.tradeCount).toBe(0);
    expect(five?.all.tradeCount).toBe(1);
  });

  it("partitions without duplication or proration", () => {
    const result = analyze([
      trade({ entryDate: "2026-09-12", net: 100 }),
      trade({ entryDate: "2026-09-14", net: 200 }),
    ]);
    const five = result.legs[1];
    expect(five?.is.tradeCount).toBe(1);
    expect(five?.oos.tradeCount).toBe(1);
    expect(five?.all.tradeCount).toBe(2);
    expect((five?.is.netPnlPaise ?? 0) + (five?.oos.netPnlPaise ?? 0)).toBe(five?.all.netPnlPaise);
  });
});

describe("net P&L and trade count", () => {
  it("sums net economics across positive, negative, mixed, and zero sets", () => {
    expect(analyze([trade({ entryDate: "2026-09-01", net: 100 })]).legs[1]?.all.netPnlPaise).toBe(
      100,
    );
    expect(analyze([trade({ entryDate: "2026-09-01", net: -100 })]).legs[1]?.all.netPnlPaise).toBe(
      -100,
    );
    expect(
      analyze([
        trade({ entryDate: "2026-09-01", net: 100 }),
        trade({ entryDate: "2026-09-02", net: -40 }),
      ]).legs[1]?.all.netPnlPaise,
    ).toBe(60);
    expect(analyze([trade({ entryDate: "2026-09-01", net: 0 })]).legs[1]?.all.netPnlPaise).toBe(0);
  });

  it("counts completed trades only", () => {
    const result = analyze([
      trade({ entryDate: "2026-09-01", net: 10 }),
      trade({ entryDate: "2026-09-02", net: -5 }),
    ]);
    expect(result.legs[1]?.all.tradeCount).toBe(2);
    expect(analyze([]).legs[1]?.all.tradeCount).toBe(0);
  });
});

describe("win rate", () => {
  it("classifies wins, losses, and flats on net P&L with completed-trade denominator", () => {
    const result = analyze([
      trade({ entryDate: "2026-09-01", net: 10 }),
      trade({ entryDate: "2026-09-02", net: -5 }),
      trade({ entryDate: "2026-09-03", net: 0 }),
    ]);
    const all = result.legs[1]?.all;
    expect(all?.winCount).toBe(1);
    expect(all?.lossCount).toBe(1);
    expect(all?.flatCount).toBe(1);
    expect(all?.winRate).toMatchObject({ num: 1, den: 3, decimal: "0.333333" });
  });

  it("returns null for zero completed trades", () => {
    expect(analyze([]).legs[1]?.all.winRate).toBeNull();
  });
});

describe("expectancy", () => {
  it("uses exact rational arithmetic and null on empty sets", () => {
    const result = analyze([
      trade({ entryDate: "2026-09-01", net: 100 }),
      trade({ entryDate: "2026-09-02", net: -30 }),
      trade({ entryDate: "2026-09-03", net: -30 }),
    ]);
    expect(result.legs[1]?.all.expectancy).toMatchObject({ num: 40, den: 3, decimal: "13.333333" });
    expect(
      analyze([trade({ entryDate: "2026-09-01", net: -50 })]).legs[1]?.all.expectancy,
    ).toMatchObject({ num: -50, den: 1 });
    expect(analyze([]).legs[1]?.all.expectancy).toBeNull();
  });
});

describe("profit factor", () => {
  it("uses slipped gross, never net, and handles zero gross losses deterministically", () => {
    const result = analyze([
      trade({
        entryDate: "2026-09-01",
        net: 60,
        grossPnlPaise: 100,
        buyStatutoryPaise: 20,
        sellStatutoryPaise: 20,
      }),
      trade({
        entryDate: "2026-09-02",
        net: -90,
        grossPnlPaise: -50,
        buyStatutoryPaise: 20,
        sellStatutoryPaise: 20,
      }),
    ]);
    const all = result.legs[1]?.all;
    // Gross-based: 100/50 = 2. Net-based would be 60/90 — rejected by construction.
    expect(all?.profitFactor).toMatchObject({ num: 100, den: 50, decimal: "2.000000" });
  });

  it("returns null with a note when gross losses are zero", () => {
    const allWin = analyze([trade({ entryDate: "2026-09-01", net: 60, grossPnlPaise: 100 })])
      .legs[1]?.all;
    expect(allWin?.profitFactor).toBeNull();
    expect(allWin?.profitFactorNote).toBe("no-losing-trades");
    const empty = analyze([]).legs[1]?.all;
    expect(empty?.profitFactor).toBeNull();
    expect(empty?.profitFactorNote).toBe("no-trades");
  });
});

describe("maximum drawdown", () => {
  it("tracks net-cumulative equity from zero with no account balance", () => {
    expect(
      analyze([
        trade({ entryDate: "2026-09-01", net: 100 }),
        trade({ entryDate: "2026-09-02", net: 100 }),
      ]).legs[1]?.all.maxDrawdownPaise,
    ).toBe(0);
    expect(
      analyze([
        trade({ entryDate: "2026-09-01", net: 200 }),
        trade({ entryDate: "2026-09-02", net: -300 }),
      ]).legs[1]?.all.maxDrawdownPaise,
    ).toBe(300);
    expect(
      analyze([
        trade({ entryDate: "2026-09-01", net: 100 }),
        trade({ entryDate: "2026-09-02", net: 100 }),
        trade({ entryDate: "2026-09-03", net: -150 }),
        trade({ entryDate: "2026-09-04", net: 100 }),
      ]).legs[1]?.all.maxDrawdownPaise,
    ).toBe(150);
    expect(
      analyze([
        trade({ entryDate: "2026-09-01", net: -50 }),
        trade({ entryDate: "2026-09-02", net: -50 }),
      ]).legs[1]?.all.maxDrawdownPaise,
    ).toBe(100);
    expect(analyze([]).legs[1]?.all.maxDrawdownPaise).toBe(0);
  });
});

describe("cost drag", () => {
  it("decomposes statutory and slippage without deducting again", () => {
    const result = analyze([
      trade({
        entryDate: "2026-09-01",
        net: 60,
        grossPnlPaise: 100,
        entrySlippagePaise: 5,
        exitSlippagePaise: 6,
        quantity: 2,
        buyStatutoryPaise: 2372,
        sellStatutoryPaise: 2371,
      }),
    ]);
    const drag = result.legs[1]?.all.costDrag;
    expect(drag).toMatchObject({ statutoryPaise: 4743, slippagePaise: 22, totalPaise: 4765 });
    // Net is consumed from M1-C, never recomputed: 100 - 22 - ... net stays 60 as supplied.
    expect(result.legs[1]?.all.netPnlPaise).toBe(60);
  });
});

describe("sensitivity preservation and reference", () => {
  function fullStack(): SensitivityResult {
    const bars: Bar[] = [10, 11, 12, 13, 14, 15, 16, 17].map((day, i) => ({
      date: `2026-09-${day}`,
      symbol: "DEMO",
      openPaise: 10000 + i * 100,
      highPaise: 10000 + i * 100 + 150,
      lowPaise: 10000 + i * 100 - 50,
      closePaise: 10000 + i * 100 + 50,
      volume: 1000,
    }));
    const decisions: StrategyDecision[] = bars.map((b, i) => {
      if (i === 2) {
        return { kind: "entry", direction: "long", stopPaise: 9000, targetPaise: null, note: "t" };
      }
      if (i === 3 || i === 5) {
        return { kind: "exit", note: "t" };
      }
      if (i === 4) {
        return { kind: "entry", direction: "long", stopPaise: 9000, targetPaise: null, note: "t" };
      }
      return { kind: "no-signal" };
    });
    let calls = 0;
    const evaluate: StrategyEvaluate = (context) => {
      const decision = decisions[context.bars.length - 1] ?? { kind: "no-signal" };
      calls += 1;
      void calls;
      return decision;
    };
    return runSensitivity({
      bars,
      evaluate,
      params: { fastPeriod: 2, slowPeriod: 3, stopLookback: 2, minBars: 3 },
      quantity: 1,
      brokeragePaise: 2000,
    });
  }

  it("preserves all three legs with 5 bps fixed as reference, no ranking", () => {
    const sens = fullStack();
    expect(sens.status).toBe("ok");
    if (sens.status !== "ok") {
      throw new Error("expected ok sensitivity");
    }
    const before = JSON.stringify(sens);
    const result = analyzeResearch(sens);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error("expected ok research");
    }
    expect(result.splitId).toBe("SLAB-SPLIT-001");
    expect(result.splitDate).toBe("2026-09-14");
    expect(result.referenceBps).toBe(5);
    expect(result.legs.map((l) => l.slippageBps)).toEqual([0, 5, 10]);
    // Entry 09-13 → IS; entry 09-15 → OOS.
    expect(result.legs[1]?.all.tradeCount).toBe(2);
    expect(result.legs[1]?.is.tradeCount).toBe(1);
    expect(result.legs[1]?.oos.tradeCount).toBe(1);
    // Headline is the 5 bps OOS partition itself — same reference, no reselection.
    expect(result.referenceOos).toBe(result.legs[1]?.oos);
    // Input untouched by analysis.
    expect(JSON.stringify(sens)).toBe(before);
  });

  it("propagates invalid sensitivity input", () => {
    const bad: SensitivityResult = {
      status: "invalid",
      errors: [{ field: "quantity", reason: "bad" }],
    };
    const result = analyzeResearch(bad);
    expect(result.status).toBe("invalid");
  });

  it("is byte-identical for identical input", () => {
    expect(JSON.stringify(analyzeResearch(fullStack()))).toBe(
      JSON.stringify(analyzeResearch(fullStack())),
    );
  });
});

describe("runBacktest passthrough", () => {
  it("accepts real M1-C trade records without reimplementation", () => {
    const bars: Bar[] = [10, 11, 12].map((day) => ({
      date: `2026-09-${day}`,
      symbol: "DEMO",
      openPaise: 10000,
      highPaise: 10100,
      lowPaise: 9900,
      closePaise: 10000,
      volume: 1000,
    }));
    const decisions: StrategyDecision[] = [
      { kind: "entry", direction: "long", stopPaise: 9000, targetPaise: null, note: "t" },
      { kind: "exit", note: "t" },
      { kind: "no-signal" },
    ];
    const backtest = runBacktest({
      bars,
      evaluate: (context) => decisions[context.bars.length - 1] ?? { kind: "no-signal" },
      params: { fastPeriod: 2, slowPeriod: 3, stopLookback: 2, minBars: 3 },
      quantity: 1,
      slippageBps: 5,
      brokeragePaise: 2000,
    });
    expect(backtest.status).toBe("ok");
    if (backtest.status !== "ok") {
      return;
    }
    expect(backtest.trades).toHaveLength(1);
    const analyzed = analyze(backtest.trades as BacktestTrade[]);
    expect(analyzed.legs[1]?.all.tradeCount).toBe(1);
  });
});
