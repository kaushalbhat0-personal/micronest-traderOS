import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  runBacktest,
  type BacktestRunInput,
  type BacktestTrade,
} from "@/features/strategy-lab/backtester";
import { applySlippage, calculateFillCosts } from "@/features/strategy-lab/costs";
import { parseDatasetCsv } from "@/features/strategy-lab/dataset";
import { evaluateSmaCross } from "@/features/strategy-lab/strategies/sma-cross";
import type { Bar } from "@/features/strategy-lab/types";
import { STRATEGY_LAB_REFERENCE_PARAMS } from "@/features/strategy-lab/types";
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

function entryDecision(stop: number, target: number | null = null): StrategyDecision {
  return {
    kind: "entry",
    direction: "long",
    stopPaise: stop,
    targetPaise: target,
    note: "test entry",
  };
}

function exitDecision(): StrategyDecision {
  return { kind: "exit", note: "test exit" };
}

/** Scripted stub strategy (test-only): replays decisions per close, recording visible window sizes. */
function scripted(decisions: StrategyDecision[]): StrategyEvaluate & { windows: number[] } {
  const windows: number[] = [];
  const fn = (context: { bars: readonly Bar[] }): StrategyDecision => {
    windows.push(context.bars.length);
    return decisions[windows.length - 1] ?? NO_SIGNAL;
  };
  return Object.assign(fn, { windows });
}

function run(
  bars: Bar[],
  evaluate: StrategyEvaluate,
  over: Partial<BacktestRunInput> = {},
): ReturnType<typeof runBacktest> {
  return runBacktest({
    bars,
    evaluate,
    params: { fastPeriod: 2, slowPeriod: 3, stopLookback: 2, minBars: 3 },
    quantity: 10,
    slippageBps: 0,
    brokeragePaise: 0,
    ...over,
  });
}

function okOf(
  result: ReturnType<typeof runBacktest>,
): Extract<ReturnType<typeof runBacktest>, { status: "ok" }> {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") {
    throw new Error("expected ok run");
  }
  return result;
}

describe("entry execution", () => {
  it("fills a bar-t signal at bar t+1 open", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10050),
      bar("2026-09-02", 10100, 10200, 10000, 10150),
      bar("2026-09-03", 10150, 10250, 10050, 10200),
    ];
    const result = okOf(run(bars, scripted([entryDecision(9000), exitDecision(), NO_SIGNAL])));
    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0] as BacktestTrade;
    expect(trade).toMatchObject({
      entryDate: "2026-09-02",
      exitDate: "2026-09-03",
      entryRawPricePaise: 10100,
      exitRawPricePaise: 10150,
      exitReason: "signal",
      forcedExitAtEnd: false,
    });
    expect(trade?.grossPnlPaise).toBe((10150 - 10100) * 10);
  });

  it("drops an entry signal on the final bar with no next bar", () => {
    const bars = [bar("2026-09-01", 10000, 10100, 9900, 10050)];
    const result = okOf(run(bars, scripted([entryDecision(9000)])));
    expect(result.trades).toHaveLength(0);
    expect(result.diagnostics.signalsUnexecutedAtEnd).toBe(1);
  });
});

describe("gap-through rules", () => {
  // d0: signal bar. d1: entry bar (open 10050, untouched). d2: the gap/exit bar.
  const entryBars = [
    bar("2026-09-01", 10000, 10100, 9900, 10050),
    bar("2026-09-02", 10050, 10100, 10000, 10050),
  ];

  it("fills a stop gap-through at the open", () => {
    const bars = [...entryBars, bar("2026-09-03", 9800, 9900, 9700, 9850)];
    const result = okOf(run(bars, scripted([entryDecision(9900), NO_SIGNAL, NO_SIGNAL])));
    const trade = result.trades[0] as BacktestTrade;
    expect(trade).toMatchObject({ exitRawPricePaise: 9800, exitReason: "stop" });
  });

  it("fills an intrabar stop at the stop price", () => {
    const bars = [...entryBars, bar("2026-09-03", 10050, 10100, 9850, 10000)];
    const result = okOf(run(bars, scripted([entryDecision(9900), NO_SIGNAL, NO_SIGNAL])));
    const trade = result.trades[0] as BacktestTrade;
    expect(trade).toMatchObject({ exitRawPricePaise: 9900, exitReason: "stop" });
  });

  it("fills a target gap-through at the open", () => {
    const bars = [...entryBars, bar("2026-09-03", 11100, 11200, 11000, 11150)];
    const result = okOf(run(bars, scripted([entryDecision(9000, 11000), NO_SIGNAL, NO_SIGNAL])));
    const trade = result.trades[0] as BacktestTrade;
    expect(trade).toMatchObject({ exitRawPricePaise: 11100, exitReason: "target" });
  });

  it("fills an intrabar target at the target price", () => {
    const bars = [...entryBars, bar("2026-09-03", 10500, 11100, 10400, 11050)];
    const result = okOf(run(bars, scripted([entryDecision(9000, 11000), NO_SIGNAL, NO_SIGNAL])));
    const trade = result.trades[0] as BacktestTrade;
    expect(trade).toMatchObject({ exitRawPricePaise: 11000, exitReason: "target" });
  });

  it("lets stop win when both are touched in one bar", () => {
    const bars = [...entryBars, bar("2026-09-03", 10050, 11200, 9800, 10500)];
    const result = okOf(run(bars, scripted([entryDecision(9900, 11000), NO_SIGNAL, NO_SIGNAL])));
    const trade = result.trades[0] as BacktestTrade;
    expect(trade).toMatchObject({ exitRawPricePaise: 9900, exitReason: "stop" });
  });
});

describe("entry-bar protective checks", () => {
  it("holds a valid protective stop through the entry bar", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10050),
      bar("2026-09-02", 10100, 10200, 10050, 10150),
      bar("2026-09-03", 10150, 10250, 10050, 10200),
    ];
    const result = okOf(run(bars, scripted([entryDecision(9000), NO_SIGNAL, NO_SIGNAL])));
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ entryDate: "2026-09-02", exitReason: "forced-final" });
  });

  it("rejects a stop equal to the actual fill", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10050),
      bar("2026-09-02", 10100, 10200, 10050, 10150),
    ];
    const result = okOf(run(bars, scripted([entryDecision(10100), NO_SIGNAL])));
    expect(result.trades).toHaveLength(0);
    expect(result.rejectedEntries).toHaveLength(1);
    expect(result.rejectedEntries[0]).toMatchObject({
      reason: "non-protective-stop",
      date: "2026-09-02",
    });
  });

  it("rejects a stop above the actual fill", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10050),
      bar("2026-09-02", 10100, 10200, 10050, 10150),
    ];
    const result = okOf(run(bars, scripted([entryDecision(10300), NO_SIGNAL])));
    expect(result.trades).toHaveLength(0);
    expect(result.rejectedEntries).toHaveLength(1);
  });

  it("exits same-bar when the entry bar trades through the stop", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10050),
      bar("2026-09-02", 10100, 10150, 9900, 10000),
    ];
    const result = okOf(run(bars, scripted([entryDecision(9950), NO_SIGNAL])));
    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0] as BacktestTrade;
    expect(trade).toMatchObject({
      entryDate: "2026-09-02",
      exitDate: "2026-09-02",
      entryRawPricePaise: 10100,
      exitRawPricePaise: 9950,
      exitReason: "stop",
      forcedExitAtEnd: false,
    });
  });
});

describe("signal exit vs protective exit", () => {
  it("executes a signal exit at the next open", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10050),
      bar("2026-09-02", 10100, 10200, 10050, 10150),
      bar("2026-09-03", 10150, 10250, 10050, 10200),
    ];
    const result = okOf(run(bars, scripted([entryDecision(9000), exitDecision(), NO_SIGNAL])));
    expect(result.trades[0]).toMatchObject({
      exitDate: "2026-09-03",
      exitRawPricePaise: 10150,
      exitReason: "signal",
    });
  });

  it("gives a protective stop priority over a pending signal exit", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10050),
      bar("2026-09-02", 10100, 10200, 10050, 10150),
      bar("2026-09-03", 9800, 9900, 9700, 9850),
    ];
    const result = okOf(run(bars, scripted([entryDecision(9900), exitDecision(), NO_SIGNAL])));
    expect(result.trades[0]).toMatchObject({ exitRawPricePaise: 9800, exitReason: "stop" });
  });
});

describe("forced final exit", () => {
  it("exits at the final close with sell slippage and costs", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10050),
      bar("2026-09-02", 10100, 10200, 10050, 10150),
      bar("2026-09-03", 10150, 10250, 10050, 11000),
    ];
    const result = okOf(
      run(bars, scripted([entryDecision(9000), NO_SIGNAL, NO_SIGNAL]), {
        slippageBps: 5,
        quantity: 1,
        brokeragePaise: 0,
      }),
    );
    const trade = result.trades[0] as BacktestTrade;
    // Sell slip on 11000 at 5 bps: roundHalfUp(5.5) = 6 → 10994.
    expect(trade).toMatchObject({
      exitDate: "2026-09-03",
      exitRawPricePaise: 11000,
      exitFillPricePaise: 10994,
      exitSlippagePaise: 6,
      exitReason: "forced-final",
      forcedExitAtEnd: true,
    });
  });
});

describe("slippage", () => {
  it("is identity at 0 bps", () => {
    expect(applySlippage(10000, "buy", 0)).toMatchObject({ slipPaise: 0, fillPricePaise: 10000 });
    expect(applySlippage(10000, "sell", 0)).toMatchObject({ slipPaise: 0, fillPricePaise: 10000 });
  });

  it("rounds half-up symmetrically at 5 and 10 bps", () => {
    expect(applySlippage(10000, "buy", 5)).toMatchObject({ slipPaise: 5, fillPricePaise: 10005 });
    expect(applySlippage(11000, "buy", 5)).toMatchObject({ slipPaise: 6, fillPricePaise: 11006 });
    expect(applySlippage(11000, "sell", 5)).toMatchObject({ slipPaise: 6, fillPricePaise: 10994 });
    expect(applySlippage(10000, "buy", 10)).toMatchObject({ slipPaise: 10, fillPricePaise: 10010 });
    expect(applySlippage(11000, "sell", 10)).toMatchObject({
      slipPaise: 11,
      fillPricePaise: 10989,
    });
  });

  it("floors sell fills at 1 paise", () => {
    expect(applySlippage(1, "sell", 10000)).toMatchObject({ fillPricePaise: 1 });
  });
});

describe("cost accounting", () => {
  it("matches the locked hand calculation: gross 989, statutory 4743, net -3754", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10050),
      bar("2026-09-03", 11000, 11100, 10900, 11050),
    ];
    const result = okOf(
      run(bars, scripted([entryDecision(9000), exitDecision(), NO_SIGNAL]), {
        slippageBps: 5,
        quantity: 1,
        brokeragePaise: 2000,
      }),
    );
    const trade = result.trades[0] as BacktestTrade;
    expect(trade).toMatchObject({
      entryRawPricePaise: 10000,
      entryFillPricePaise: 10005,
      entrySlippagePaise: 5,
      exitRawPricePaise: 11000,
      exitFillPricePaise: 10994,
      exitSlippagePaise: 6,
      buyStatutoryPaise: 2372,
      sellStatutoryPaise: 2371,
      grossPnlPaise: 989,
      netPnlPaise: -3754,
    });
    // Diagnostic identity: slippage enters once, through the fills.
    const grossBeforeSlip = (trade.exitRawPricePaise - trade.entryRawPricePaise) * trade.quantity;
    const slippagePaise = (trade.entrySlippagePaise + trade.exitSlippagePaise) * trade.quantity;
    expect(grossBeforeSlip - trade.grossPnlPaise).toBe(slippagePaise);
  });

  it("includes brokerage in the GST base", () => {
    // 18% of ₹20 brokerage alone is ₹3.60 → 360 paise; GST must be at least that.
    const costs = calculateFillCosts(10000, "buy", 2000);
    expect(costs.gstPaise).toBeGreaterThanOrEqual(360);
    expect(costs).toMatchObject({ brokeragePaise: 2000, stampPaise: 2 });
  });
});

describe("determinism and input validation", () => {
  const bars = [
    bar("2026-09-01", 10000, 10100, 9900, 10000),
    bar("2026-09-02", 10000, 10100, 9900, 10050),
    bar("2026-09-03", 11000, 11100, 10900, 11050),
  ];

  it("produces byte-identical output for identical input", () => {
    const input = {
      bars,
      evaluate: scripted([entryDecision(9000), exitDecision(), NO_SIGNAL]),
      params: { fastPeriod: 2, slowPeriod: 3, stopLookback: 2, minBars: 3 },
      quantity: 1,
      slippageBps: 5,
      brokeragePaise: 2000,
    };
    const first = runBacktest({
      ...input,
      evaluate: scripted([entryDecision(9000), exitDecision(), NO_SIGNAL]),
    });
    const second = runBacktest({
      ...input,
      evaluate: scripted([entryDecision(9000), exitDecision(), NO_SIGNAL]),
    });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("rejects structurally invalid runs without repairing them", () => {
    const good = {
      bars,
      evaluate: scripted([NO_SIGNAL, NO_SIGNAL, NO_SIGNAL]),
      params: { fastPeriod: 2, slowPeriod: 3, stopLookback: 2, minBars: 3 },
      quantity: 1,
      slippageBps: 5,
      brokeragePaise: 2000,
    };
    expect(runBacktest({ ...good, bars: [] }).status).toBe("invalid");
    expect(runBacktest({ ...good, quantity: 0 }).status).toBe("invalid");
    expect(runBacktest({ ...good, quantity: 1_000_001 }).status).toBe("invalid");
    expect(runBacktest({ ...good, slippageBps: 7 }).status).toBe("invalid");
    expect(runBacktest({ ...good, brokeragePaise: -1 }).status).toBe("invalid");
    expect(
      runBacktest({
        ...good,
        params: { fastPeriod: 30, slowPeriod: 30, stopLookback: 20, minBars: 30 },
      }).status,
    ).toBe("invalid");
    expect(runBacktest({ ...good, bars: [...bars].reverse() }).status).toBe("invalid");
  });
});

describe("no leakage", () => {
  it("calls the strategy with exactly bars[0..t] and returns a minimal result shape", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10050),
      bar("2026-09-02", 10100, 10200, 10050, 10150),
      bar("2026-09-03", 10150, 10250, 10050, 10200),
    ];
    const stub = scripted([NO_SIGNAL, NO_SIGNAL, NO_SIGNAL]);
    const result = okOf(run(bars, stub));
    expect(stub.windows).toEqual([1, 2, 3]);
    expect(Object.keys(result).sort()).toEqual([
      "diagnostics",
      "rejectedEntries",
      "status",
      "trades",
    ]);
    expect(result.diagnostics.barsProcessed).toBe(3);
  });

  it("runs the real SLAB-STRAT-001 end to end on the pinned fixture", () => {
    const csvText = readFileSync(
      join(process.cwd(), "features", "strategy-lab", "fixtures", "sample-bars.csv"),
      "utf8",
    );
    const parsed = parseDatasetCsv(csvText);
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }
    const first = runBacktest({
      bars: parsed.bars,
      evaluate: evaluateSmaCross,
      params: STRATEGY_LAB_REFERENCE_PARAMS,
      quantity: 1,
      slippageBps: 5,
      brokeragePaise: 2000,
    });
    const second = runBacktest({
      bars: parsed.bars,
      evaluate: evaluateSmaCross,
      params: STRATEGY_LAB_REFERENCE_PARAMS,
      quantity: 1,
      slippageBps: 5,
      brokeragePaise: 2000,
    });
    expect(first.status).toBe("ok");
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
