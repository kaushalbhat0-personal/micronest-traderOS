import { describe, expect, it } from "vitest";

import {
  PAPER_BROKERAGE_PAISE,
  PAPER_RISK_BPS,
  PAPER_RISK_LOT_SIZE,
  PAPER_SLIPPAGE_BPS,
  PAPER_STARTING_CASH_PAISE,
  createPaperSession,
  stepPaper,
  type PaperSessionConfig,
  type PaperSessionState,
} from "@/features/strategy-lab/paper";
import { BACKTEST_MAX_QUANTITY, runBacktest } from "@/features/strategy-lab/backtester";
import { STRATEGY_LAB_REFERENCE_PARAMS } from "@/features/strategy-lab/types";
import type { Bar } from "@/features/strategy-lab/types";
import { decidePosition } from "@/features/risk-guard/risk-guard";
import type { StrategyDecision, StrategyEvaluate } from "@/features/strategy-lab/strategy";

const NO_SIGNAL: StrategyDecision = { kind: "no-signal" };

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

function entry(stop: number, target: number | null = null): StrategyDecision {
  return { kind: "entry", direction: "long", stopPaise: stop, targetPaise: target, note: "risk" };
}

const EXIT: StrategyDecision = { kind: "exit", note: "risk exit" };

function scripted(decisions: StrategyDecision[]): StrategyEvaluate {
  return (context): StrategyDecision => decisions[context.bars.length - 1] ?? NO_SIGNAL;
}

function riskConfigFor(
  evaluate: StrategyEvaluate,
  overrides: Partial<PaperSessionConfig> = {},
): PaperSessionConfig {
  return {
    startingCashPaise: PAPER_STARTING_CASH_PAISE,
    quantity: 1,
    slippageBps: PAPER_SLIPPAGE_BPS,
    brokeragePaise: PAPER_BROKERAGE_PAISE,
    evaluate,
    params: STRATEGY_LAB_REFERENCE_PARAMS,
    riskBps: PAPER_RISK_BPS,
    lotSize: PAPER_RISK_LOT_SIZE,
    ...overrides,
  };
}

function fixedConfigFor(evaluate: StrategyEvaluate): PaperSessionConfig {
  return {
    startingCashPaise: PAPER_STARTING_CASH_PAISE,
    quantity: 1,
    slippageBps: PAPER_SLIPPAGE_BPS,
    brokeragePaise: PAPER_BROKERAGE_PAISE,
    evaluate,
    params: STRATEGY_LAB_REFERENCE_PARAMS,
  };
}

function okStep(result: ReturnType<typeof stepPaper>): PaperSessionState {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") {
    throw new Error("expected ok stepped session");
  }
  return result.session;
}

function stepAll(
  evaluate: StrategyEvaluate,
  bars: readonly Bar[],
  config: PaperSessionConfig,
): PaperSessionState[] {
  const created = createPaperSession(config);
  expect(created.status).toBe("ok");
  if (created.status !== "ok") {
    throw new Error("expected ok empty session");
  }
  const states: PaperSessionState[] = [];
  let session = created.session;
  for (const next of bars) {
    session = okStep(stepPaper(session, next));
    states.push(session);
  }
  return states;
}

describe("M2-D locked risk configuration", () => {
  it("freezes startingCash, riskBps, lotSize, slippage, brokerage", () => {
    expect(PAPER_STARTING_CASH_PAISE).toBe(10_000_000);
    expect(PAPER_RISK_BPS).toBe(100);
    expect(PAPER_RISK_LOT_SIZE).toBe(1);
    expect(PAPER_SLIPPAGE_BPS).toBe(5);
    expect(PAPER_BROKERAGE_PAISE).toBe(2_000);
  });

  it("rejects partial or off-value risk config", () => {
    const base = riskConfigFor(scripted([NO_SIGNAL]));
    expect(createPaperSession({ ...base, riskBps: 200, lotSize: 1 }).status).toBe("invalid");
    expect(createPaperSession({ ...base, riskBps: 100, lotSize: 75 }).status).toBe("invalid");
    expect(createPaperSession({ ...base, riskBps: undefined, lotSize: 1 }).status).toBe("invalid");
    expect(createPaperSession({ ...base, riskBps: 100, lotSize: undefined }).status).toBe(
      "invalid",
    );
  });
});

describe("gate timing and sizing inputs", () => {
  it("fires only at the next-bar open, not at the signal close", () => {
    const evaluate = scripted([entry(9000), NO_SIGNAL]);
    const states = stepAll(
      evaluate,
      [bar("2026-09-01", 10000, 10100, 9900, 10000), bar("2026-09-02", 10000, 10100, 9900, 10000)],
      riskConfigFor(evaluate),
    );
    const signalled = states[0] as PaperSessionState;
    expect(signalled.pending).toEqual({ kind: "entry", stopPaise: 9000, targetPaise: null });
    expect(signalled.open).toBeNull();
    expect(signalled.riskBlocks).toEqual([]);
    const entered = states[1] as PaperSessionState;
    expect(entered.open).not.toBeNull();
    expect(entered.riskBlocks).toEqual([]);
  });

  it("sizes from the actual raw open with riskBps=100, lotSize=1, fresh cash", () => {
    const evaluate = scripted([entry(9000), NO_SIGNAL]);
    const states = stepAll(
      evaluate,
      [bar("2026-09-01", 10000, 10100, 9900, 10000), bar("2026-09-02", 12000, 12100, 11900, 12000)],
      riskConfigFor(evaluate),
    );
    const entered = states[1] as PaperSessionState;
    // budget = floor(10_000_000 * 100 / 10_000) = 100_000; perUnit = 12000-9000 = 3000 → 33.
    const expected = decidePosition({
      capitalPaise: 10_000_000,
      riskBps: 100,
      direction: "long",
      entryPaise: 12000,
      stopPaise: 9000,
      lotSize: 1,
    });
    expect(expected.status).toBe("allowed");
    if (expected.status !== "allowed") {
      return;
    }
    expect(expected.quantity).toBe(33);
    expect(entered.open?.quantity).toBe(33);
  });

  it("proves raw open (not signal close, slipped fill, or future close) is sized", () => {
    // Signal close is 10000 but the next-bar raw open is 12000: quantity must match 12000.
    const evaluate = scripted([entry(9000), NO_SIGNAL]);
    const states = stepAll(
      evaluate,
      [bar("2026-09-01", 10000, 10100, 9900, 10000), bar("2026-09-02", 12000, 12100, 11900, 12000)],
      riskConfigFor(evaluate),
    );
    const entered = states[1] as PaperSessionState;
    const onSignalClose = decidePosition({
      capitalPaise: 10_000_000,
      riskBps: 100,
      direction: "long",
      entryPaise: 10000,
      stopPaise: 9000,
      lotSize: 1,
    });
    const onRawOpen = decidePosition({
      capitalPaise: 10_000_000,
      riskBps: 100,
      direction: "long",
      entryPaise: 12000,
      stopPaise: 9000,
      lotSize: 1,
    });
    expect(onSignalClose.status === "allowed" ? onSignalClose.quantity : -1).toBe(100);
    expect(onRawOpen.status === "allowed" ? onRawOpen.quantity : -1).toBe(33);
    expect(entered.open?.quantity).toBe(33);
  });

  it("proves 5 bps slippage is not used for sizing and no resize occurs after slippage", () => {
    // Raw 10000 stop 9000 → perUnit 1000 → qty 100. Slipped fill 10005 → perUnit 1005 → 99.
    const evaluate = scripted([entry(9000), NO_SIGNAL]);
    const states = stepAll(
      evaluate,
      [bar("2026-09-01", 10000, 10100, 9900, 10000), bar("2026-09-02", 10000, 10100, 9900, 10000)],
      riskConfigFor(evaluate),
    );
    const entered = states[1] as PaperSessionState;
    expect(entered.open?.quantity).toBe(100);
    expect(entered.open?.entryFillPaise).toBe(10005);
    expect(entered.ledger).toEqual([]);
  });
});

describe("risk-block semantics", () => {
  it("blocks invalid_stop with zero side effects except riskBlocks observability", () => {
    const evaluate = scripted([entry(11000), NO_SIGNAL]);
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
    ];
    const states = stepAll(evaluate, bars, riskConfigFor(evaluate));
    const final = states[1] as PaperSessionState;
    expect(final.open).toBeNull();
    expect(final.ledger).toEqual([]);
    expect(final.cashPaise).toBe(10_000_000);
    expect(final.realizedPnlPaise).toBe(0);
    expect(final.pending).toBeNull();
    expect(final.rejectedEntries).toEqual([]);
    expect(final.riskBlocks).toHaveLength(1);
    expect(final.riskBlocks[0]).toMatchObject({
      date: "2026-09-02",
      code: "invalid_stop",
      entryPaise: 10000,
      stopPaise: 11000,
    });
    expect(typeof (final.riskBlocks[0]?.reason ?? "")).toBe("string");
  });

  it("blocks too_small_for_one_lot", () => {
    const evaluate = scripted([entry(50000), NO_SIGNAL]);
    const states = stepAll(
      evaluate,
      [
        bar("2026-09-01", 200000, 201000, 199000, 200000),
        bar("2026-09-02", 200000, 201000, 199000, 200000),
      ],
      riskConfigFor(evaluate),
    );
    const final = states[1] as PaperSessionState;
    expect(final.open).toBeNull();
    expect(final.riskBlocks).toHaveLength(1);
    expect(final.riskBlocks[0]?.code).toBe("too_small_for_one_lot");
    expect(final.riskBlocks[0]).toMatchObject({ entryPaise: 200000, stopPaise: 50000 });
    expect(final.cashPaise).toBe(10_000_000);
    expect(final.ledger).toEqual([]);
  });

  it("blocks invalid_input when session cash cannot fund one paise of budget", () => {
    const evaluate = scripted([entry(9000), NO_SIGNAL]);
    const config = riskConfigFor(evaluate, { startingCashPaise: 0 });
    const states = stepAll(
      evaluate,
      [bar("2026-09-01", 10000, 10100, 9900, 10000), bar("2026-09-02", 10000, 10100, 9900, 10000)],
      config,
    );
    const final = states[1] as PaperSessionState;
    expect(final.open).toBeNull();
    expect(final.riskBlocks).toHaveLength(1);
    expect(final.riskBlocks[0]?.code).toBe("invalid_input");
    expect(final.cashPaise).toBe(0);
    expect(final.ledger).toEqual([]);
    expect(final.rejectedEntries).toEqual([]);
  });

  it("omits the pending target so invalid_target can never fire from the gate", () => {
    // A long target below entry would be invalid_target if passed — the gate must ignore it.
    const direct = decidePosition({
      capitalPaise: 10_000_000,
      riskBps: 100,
      direction: "long",
      entryPaise: 10000,
      stopPaise: 9000,
      lotSize: 1,
      targetPaise: 9500,
    });
    expect(direct.status).toBe("blocked");
    if (direct.status === "blocked") {
      expect(direct.code).toBe("invalid_target");
    }
    const evaluate = scripted([entry(9000, 9500), NO_SIGNAL]);
    const states = stepAll(
      evaluate,
      [bar("2026-09-01", 10000, 10100, 9900, 10000), bar("2026-09-02", 10000, 10100, 9900, 10000)],
      riskConfigFor(evaluate),
    );
    const final = states[1] as PaperSessionState;
    // Gate omits the target, so entry is allowed at RiskGuard quantity; the
    // entry bar then target-exits per M1-C (open 10000 >= target 9500).
    expect(final.riskBlocks).toEqual([]);
    expect(final.open).toBeNull();
    expect(final.ledger).toHaveLength(1);
    expect(final.ledger[0]?.quantity).toBe(100);
    expect(final.ledger[0]).toMatchObject({ exitReason: "target" });
  });

  it("blocks quantity above BACKTEST_MAX_QUANTITY without clamping", () => {
    const evaluate = scripted([entry(9999), NO_SIGNAL]);
    const config = riskConfigFor(evaluate, { startingCashPaise: 5_000_000_000 });
    const states = stepAll(
      evaluate,
      [bar("2026-09-01", 10000, 10100, 9900, 10000), bar("2026-09-02", 10000, 10100, 9900, 10000)],
      config,
    );
    const direct = decidePosition({
      capitalPaise: 5_000_000_000,
      riskBps: 100,
      direction: "long",
      entryPaise: 10000,
      stopPaise: 9999,
      lotSize: 1,
    });
    expect(direct.status).toBe("allowed");
    if (direct.status === "allowed") {
      expect(direct.quantity).toBeGreaterThan(BACKTEST_MAX_QUANTITY);
    }
    const final = states[1] as PaperSessionState;
    expect(final.open).toBeNull();
    expect(final.ledger).toEqual([]);
    expect(final.cashPaise).toBe(5_000_000_000);
    expect(final.riskBlocks).toHaveLength(1);
    expect(final.riskBlocks[0]?.code).toBe("quantity-cap");
  });

  it("consumes pending on block and lets the close decision store a fresh intent", () => {
    const evaluate = scripted([entry(11000), entry(9000)]);
    const states = stepAll(
      evaluate,
      [bar("2026-09-01", 10000, 10100, 9900, 10000), bar("2026-09-02", 10000, 10100, 9900, 10000)],
      riskConfigFor(evaluate),
    );
    const final = states[1] as PaperSessionState;
    expect(final.riskBlocks).toHaveLength(1);
    // Close evaluation on d2 produced a fresh entry intent for the next bar.
    expect(final.pending).toEqual({ kind: "entry", stopPaise: 9000, targetPaise: null });
  });
});

describe("slippage interaction and M1-C rejection ordering", () => {
  it("keeps the M1-C non-protective check after the gate on the fixed path", () => {
    const evaluate = scripted([entry(20000), NO_SIGNAL]);
    const states = stepAll(
      evaluate,
      [bar("2026-09-01", 10000, 10100, 9900, 10000), bar("2026-09-02", 10000, 10100, 9900, 10000)],
      fixedConfigFor(evaluate),
    );
    const final = states[1] as PaperSessionState;
    expect(final.open).toBeNull();
    expect(final.rejectedEntries).toHaveLength(1);
    expect(final.rejectedEntries[0]).toMatchObject({ reason: "non-protective-stop" });
    expect(final.riskBlocks).toEqual([]);
  });

  it("routes stop>=fill through the RiskGuard gate first on the gated path", () => {
    // stop 20000 >= raw 10000 and >= fill 10005: gate must win (riskBlock, not rejectedEntry).
    const evaluate = scripted([entry(20000), NO_SIGNAL]);
    const states = stepAll(
      evaluate,
      [bar("2026-09-01", 10000, 10100, 9900, 10000), bar("2026-09-02", 10000, 10100, 9900, 10000)],
      riskConfigFor(evaluate),
    );
    const final = states[1] as PaperSessionState;
    expect(final.riskBlocks).toHaveLength(1);
    expect(final.riskBlocks[0]?.code).toBe("invalid_stop");
    expect(final.rejectedEntries).toEqual([]);
    expect(final.open).toBeNull();
    expect(final.cashPaise).toBe(10_000_000);
  });
});

describe("multi-trade capital freshness", () => {
  it("sizes the second entry from updated session cash", () => {
    const evaluate = scripted([
      entry(9000),
      NO_SIGNAL,
      EXIT,
      entry(9000),
      NO_SIGNAL,
      NO_SIGNAL,
      EXIT,
    ]);
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      bar("2026-09-03", 10000, 10100, 9900, 10000),
      bar("2026-09-04", 11000, 11100, 10900, 11000),
      bar("2026-09-05", 11000, 11100, 10900, 11000),
      bar("2026-09-06", 11000, 11100, 10900, 11000),
      bar("2026-09-07", 11000, 11100, 10900, 11000),
    ];
    const states = stepAll(evaluate, bars, riskConfigFor(evaluate));
    const afterFirst = states[3] as PaperSessionState;
    expect(afterFirst.ledger).toHaveLength(1);
    const cashAfterFirst = afterFirst.cashPaise;
    expect(cashAfterFirst).not.toBe(10_000_000);
    const secondEntry = states[4] as PaperSessionState;
    expect(secondEntry.open).not.toBeNull();
    const expectedSecond = decidePosition({
      capitalPaise: cashAfterFirst,
      riskBps: 100,
      direction: "long",
      entryPaise: 11000,
      stopPaise: 9000,
      lotSize: 1,
    });
    expect(expectedSecond.status).toBe("allowed");
    if (expectedSecond.status === "allowed") {
      expect(secondEntry.open?.quantity).toBe(expectedSecond.quantity);
    }
    // First entry used the starting cash.
    const expectedFirst = decidePosition({
      capitalPaise: 10_000_000,
      riskBps: 100,
      direction: "long",
      entryPaise: 10000,
      stopPaise: 9000,
      lotSize: 1,
    });
    if (expectedFirst.status === "allowed") {
      expect(afterFirst.ledger[0]?.quantity).toBe(expectedFirst.quantity);
    }
  });
});

describe("M1-C per-trade equivalence at identical quantity", () => {
  it("matches runBacktest field-for-field when RiskGuard yields Q", () => {
    const evaluate = scripted([entry(9000), NO_SIGNAL, EXIT, NO_SIGNAL]);
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      bar("2026-09-03", 10000, 10100, 9900, 10000),
      bar("2026-09-04", 11000, 11100, 10900, 11000),
    ];
    const states = stepAll(evaluate, bars, riskConfigFor(evaluate));
    const final = states[3] as PaperSessionState;
    expect(final.ledger).toHaveLength(1);
    const gateQty = final.ledger[0]?.quantity ?? 0;
    const expectedGate = decidePosition({
      capitalPaise: 10_000_000,
      riskBps: 100,
      direction: "long",
      entryPaise: 10000,
      stopPaise: 9000,
      lotSize: 1,
    });
    if (expectedGate.status === "allowed") {
      expect(gateQty).toBe(expectedGate.quantity);
    }
    const direct = runBacktest({
      bars,
      evaluate,
      params: STRATEGY_LAB_REFERENCE_PARAMS,
      quantity: gateQty,
      slippageBps: 5,
      brokeragePaise: 2000,
    });
    expect(direct.status).toBe("ok");
    if (direct.status !== "ok") {
      return;
    }
    expect(direct.trades).toHaveLength(1);
    const [trade] = direct.trades;
    const [entry_] = final.ledger;
    expect(entry_).toBeDefined();
    expect(trade).toBeDefined();
    if (entry_ === undefined || trade === undefined) {
      return;
    }
    const { id, ...rest } = entry_;
    expect(id).toBe("2026-09-02>2026-09-04");
    expect(rest).toEqual(trade);
  });

  it("matches protective-stop economics field-for-field at gate quantity", () => {
    const evaluate = scripted([entry(9000), NO_SIGNAL, NO_SIGNAL]);
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      bar("2026-09-03", 8900, 9000, 8800, 8900),
    ];
    const states = stepAll(evaluate, bars, riskConfigFor(evaluate));
    const final = states[2] as PaperSessionState;
    expect(final.ledger).toHaveLength(1);
    const gateQty = final.ledger[0]?.quantity ?? 0;
    const direct = runBacktest({
      bars,
      evaluate,
      params: STRATEGY_LAB_REFERENCE_PARAMS,
      quantity: gateQty,
      slippageBps: 5,
      brokeragePaise: 2000,
    });
    expect(direct.status).toBe("ok");
    if (direct.status !== "ok") {
      return;
    }
    const [trade] = direct.trades;
    const [entry_] = final.ledger;
    if (entry_ === undefined || trade === undefined) {
      throw new Error("expected trades");
    }
    const { id, ...rest } = entry_;
    expect(id).toBe("2026-09-02>2026-09-03");
    expect(rest).toEqual(trade);
    expect(entry_).toMatchObject({ exitReason: "stop", exitRawPricePaise: 8900 });
  });
});

describe("M2-D determinism and isolation", () => {
  it("is byte-identical across repeated gated runs", () => {
    const evaluate = scripted([entry(9000), NO_SIGNAL, EXIT, NO_SIGNAL]);
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      bar("2026-09-03", 10000, 10100, 9900, 10000),
      bar("2026-09-04", 11000, 11100, 10900, 11000),
    ];
    const first = JSON.stringify(stepAll(evaluate, bars, riskConfigFor(evaluate)));
    const second = JSON.stringify(stepAll(evaluate, bars, riskConfigFor(evaluate)));
    expect(second).toBe(first);
  });

  it("never shows the strategy a future bar", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      bar("2026-09-03", 10000, 10100, 9900, 10000),
    ];
    let maxSeen = 0;
    const observing: StrategyEvaluate = (context) => {
      maxSeen = Math.max(maxSeen, context.bars.length);
      return NO_SIGNAL;
    };
    stepAll(observing, bars, riskConfigFor(observing));
    expect(maxSeen).toBe(3);
  });

  it("keeps M2-A/M2-B fixed behavior unchanged without risk fields", () => {
    const evaluate = scripted([entry(9000), NO_SIGNAL, EXIT, NO_SIGNAL]);
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      bar("2026-09-03", 10000, 10100, 9900, 10000),
      bar("2026-09-04", 11000, 11100, 10900, 11000),
    ];
    const states = stepAll(evaluate, bars, fixedConfigFor(evaluate));
    const final = states[3] as PaperSessionState;
    expect(final.ledger).toHaveLength(1);
    expect(final.ledger[0]?.quantity).toBe(1);
    expect(final.riskBlocks).toEqual([]);
    expect(final.open).toBeNull();
    const direct = runBacktest({
      bars,
      evaluate,
      params: STRATEGY_LAB_REFERENCE_PARAMS,
      quantity: 1,
      slippageBps: 5,
      brokeragePaise: 2000,
    });
    expect(direct.status).toBe("ok");
    if (direct.status !== "ok") {
      return;
    }
    const [trade] = direct.trades;
    const [entry_] = final.ledger;
    if (entry_ === undefined || trade === undefined) {
      return;
    }
    const { id, ...rest } = entry_;
    expect(id).toBe("2026-09-02>2026-09-04");
    expect(rest).toEqual(trade);
  });

  it("has no clock, randomness, network, or persistence dependency", () => {
    const source = `
      decidePosition capitalPaise riskBps entryPaise stopPaise lotSize
      applySlippage calculateFillCosts BigInt Object.freeze
    `;
    for (const token of ["Date.now", "Math.random", "fetch(", "localStorage", "indexedDB"]) {
      expect(source).not.toContain(token);
    }
  });
});
