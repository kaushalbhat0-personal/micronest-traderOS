import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  appendPaperBar,
  createPaperSession,
  paperUnrealizedPaise,
  replayPaperSession,
  stepPaper,
  type PaperSessionConfig,
  type PaperSessionState,
} from "@/features/strategy-lab/paper";
import { runBacktest } from "@/features/strategy-lab/backtester";
import { validateDataset } from "@/features/strategy-lab/dataset";
import { STRATEGY_LAB_REFERENCE_PARAMS } from "@/features/strategy-lab/types";
import type { Bar } from "@/features/strategy-lab/types";
import { evaluateSmaCross } from "@/features/strategy-lab/strategies/sma-cross";
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
  return {
    kind: "entry",
    direction: "long",
    stopPaise: stop,
    targetPaise: target,
    note: "stepper test entry",
  };
}

const EXIT: StrategyDecision = { kind: "exit", note: "stepper test exit" };

/** Stateless scripted strategy (test-only): decision per close index. */
function scripted(decisions: StrategyDecision[]): StrategyEvaluate {
  return (context): StrategyDecision => decisions[context.bars.length - 1] ?? NO_SIGNAL;
}

const BASE_CONFIG: Omit<PaperSessionConfig, "evaluate"> = {
  startingCashPaise: 10_000_000,
  quantity: 1,
  slippageBps: 5,
  brokeragePaise: 2000,
  params: STRATEGY_LAB_REFERENCE_PARAMS,
};

function configFor(evaluate: StrategyEvaluate): PaperSessionConfig {
  return { ...BASE_CONFIG, evaluate };
}

function okStep(result: ReturnType<typeof stepPaper>): PaperSessionState {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") {
    throw new Error("expected ok stepped session");
  }
  return result.session;
}

function stepAll(evaluate: StrategyEvaluate, bars: readonly Bar[]): PaperSessionState[] {
  const created = createPaperSession(configFor(evaluate));
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

function sessionSummary(session: PaperSessionState): string {
  return JSON.stringify({
    symbol: session.symbol,
    lastProcessedDate: session.lastProcessedDate,
    ledger: session.ledger,
    realizedPnlPaise: session.realizedPnlPaise,
    cashPaise: session.cashPaise,
    open: session.open,
    pending: session.pending,
    diagnostics: session.diagnostics,
    rejectedEntries: session.rejectedEntries,
  });
}

function fixtureBars(): Bar[] {
  const dir = join(process.cwd(), "features", "strategy-lab", "fixtures");
  const csvText = readFileSync(join(dir, "sample-bars.csv"), "utf8");
  const manifestRaw = JSON.parse(readFileSync(join(dir, "sample-bars.manifest.json"), "utf8"));
  const validated = validateDataset(csvText, manifestRaw);
  expect(validated.status).toBe("ok");
  if (validated.status !== "ok") {
    throw new Error("fixture must validate");
  }
  return [...validated.bars];
}

function replayStates(evaluate: StrategyEvaluate, bars: readonly Bar[]): PaperSessionState[] {
  const created = createPaperSession(configFor(evaluate));
  expect(created.status).toBe("ok");
  if (created.status !== "ok") {
    throw new Error("expected ok empty session");
  }
  const states: PaperSessionState[] = [];
  let session = created.session;
  for (const next of bars) {
    const appended = appendPaperBar(session, next);
    expect(appended.status).toBe("ok");
    if (appended.status !== "ok") {
      throw new Error("expected ok replayed session");
    }
    session = appended.session;
    states.push(session);
  }
  return states;
}

describe("stepper basics", () => {
  it("starts from an empty session and processes the first bar", () => {
    const created = createPaperSession(configFor(scripted([NO_SIGNAL])));
    expect(created.status).toBe("ok");
    if (created.status !== "ok") {
      return;
    }
    const first = okStep(stepPaper(created.session, bar("2026-09-01", 10000, 10100, 9900, 10000)));
    expect(first.symbol).toBe("DEMO");
    expect(first.lastProcessedDate).toBe("2026-09-01");
    expect(first.bars).toHaveLength(1);
    expect(first.ledger).toEqual([]);
    expect(first.cashPaise).toBe(10_000_000);
    expect(first.open).toBeNull();
    expect(first.pending).toBeNull();
    expect(first.diagnostics).toEqual({
      barsProcessed: 1,
      entriesExecuted: 0,
      signalsUnexecutedAtEnd: 0,
      rejectedEntries: 0,
    });
  });

  it("matches M2-A replay at every prefix of the synthetic fixture", () => {
    const bars = fixtureBars();
    const stepped = stepAll(evaluateSmaCross, bars);
    const replayed = replayStates(evaluateSmaCross, bars);
    expect(stepped).toHaveLength(bars.length);
    for (const [index, state] of stepped.entries()) {
      expect(sessionSummary(state), `prefix ${index}`).toBe(
        sessionSummary(replayed[index] as PaperSessionState),
      );
    }
  });

  it("is deterministic across repeated stepping", () => {
    const bars = fixtureBars();
    const first = stepAll(evaluateSmaCross, bars);
    const second = stepAll(evaluateSmaCross, bars);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("never mutates previous state", () => {
    const evaluate = scripted([entry(9000), NO_SIGNAL]);
    const created = createPaperSession(configFor(evaluate));
    if (created.status !== "ok") {
      return;
    }
    const before = okStep(stepPaper(created.session, bar("2026-09-01", 10000, 10100, 9900, 10000)));
    const snapshot = JSON.stringify(before);
    const after = okStep(stepPaper(before, bar("2026-09-02", 10000, 10100, 9900, 10000)));
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(after).not.toBe(before);
    expect(Object.isFrozen(after)).toBe(true);
    expect(Object.isFrozen(after.bars)).toBe(true);
    expect(Object.isFrozen(after.ledger)).toBe(true);
  });

  it("treats the identical frontier bar as an idempotent no-op", () => {
    const created = createPaperSession(configFor(scripted([NO_SIGNAL])));
    if (created.status !== "ok") {
      return;
    }
    const first = okStep(stepPaper(created.session, bar("2026-09-01", 10000, 10100, 9900, 10000)));
    const again = stepPaper(first, bar("2026-09-01", 10000, 10100, 9900, 10000));
    expect(again.status).toBe("ok");
    if (again.status !== "ok") {
      return;
    }
    expect(again.session).toBe(first);
  });

  it("rejects older, divergent, and foreign bars", () => {
    const created = createPaperSession(configFor(scripted([NO_SIGNAL, NO_SIGNAL])));
    if (created.status !== "ok") {
      return;
    }
    const first = okStep(stepPaper(created.session, bar("2026-09-02", 10000, 10100, 9900, 10000)));
    expect(stepPaper(first, bar("2026-09-01", 10000, 10100, 9900, 10000)).status).toBe("invalid");
    expect(stepPaper(first, bar("2026-09-02", 10001, 10100, 9900, 10000)).status).toBe("invalid");
    expect(
      stepPaper(first, { ...bar("2026-09-03", 10000, 10100, 9900, 10000), symbol: "X" }).status,
    ).toBe("invalid");
  });
});

describe("signal timing and next-open execution", () => {
  const bars = [
    bar("2026-09-01", 10000, 10100, 9900, 10000),
    bar("2026-09-02", 10000, 10100, 9900, 10000),
    bar("2026-09-03", 10000, 10100, 9900, 10000),
    bar("2026-09-04", 11000, 11100, 10900, 11000),
  ];
  const evaluate = scripted([entry(9000), NO_SIGNAL, EXIT, NO_SIGNAL]);

  it("executes entries and signal exits on the next open, never the signal close", () => {
    const states = stepAll(evaluate, bars);
    // After d2 (entry bar): position open, entered at d2 open.
    const entered = states[1] as PaperSessionState;
    expect(entered.open?.entryDate).toBe("2026-09-02");
    expect(entered.open?.entryFillPaise).toBe(10005);
    // After d3 (signal close): still open with a pending exit.
    const signalled = states[2] as PaperSessionState;
    expect(signalled.open?.entryDate).toBe("2026-09-02");
    expect(signalled.pending).toEqual({ kind: "exit" });
    expect(signalled.ledger).toEqual([]);
    // After d4: closed at the d4 open.
    const exited = states[3] as PaperSessionState;
    expect(exited.open).toBeNull();
    expect(exited.ledger).toHaveLength(1);
    expect(exited.ledger[0]).toMatchObject({
      entryDate: "2026-09-02",
      exitDate: "2026-09-04",
      exitReason: "signal",
    });
  });

  it("matches replay and M1-C economics on the full run", () => {
    const states = stepAll(evaluate, bars);
    const replayed = replayPaperSession(configFor(evaluate), bars);
    expect(replayed.status).toBe("ok");
    if (replayed.status !== "ok") {
      return;
    }
    const final = states[states.length - 1] as PaperSessionState;
    expect(sessionSummary(final)).toBe(sessionSummary(replayed.session));
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
    expect(final.ledger).toHaveLength(direct.trades.length);
    const [entry_] = final.ledger;
    const [trade] = direct.trades;
    expect(entry_).toBeDefined();
    expect(trade).toBeDefined();
    if (entry_ === undefined || trade === undefined) {
      return;
    }
    const { id, ...rest } = entry_;
    expect(id).toBe("2026-09-02>2026-09-04");
    expect(rest).toEqual(trade);
    expect(final.realizedPnlPaise).toBe(trade?.netPnlPaise);
    expect(final.cashPaise).toBe(10_000_000 + (trade?.netPnlPaise ?? 0));
  });
});

describe("protective exits", () => {
  it("fills a stop gap-through at the open", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      // Gap below the 9000 stop: raw exit is the 8900 open.
      bar("2026-09-03", 8900, 9000, 8800, 8900),
    ];
    const states = stepAll(scripted([entry(9000), NO_SIGNAL, NO_SIGNAL]), bars);
    const final = states[states.length - 1] as PaperSessionState;
    expect(final.open).toBeNull();
    expect(final.ledger[0]).toMatchObject({ exitReason: "stop", exitRawPricePaise: 8900 });
    const replayed = replayPaperSession(
      configFor(scripted([entry(9000), NO_SIGNAL, NO_SIGNAL])),
      bars,
    );
    expect(replayed.status).toBe("ok");
    if (replayed.status !== "ok") {
      return;
    }
    expect(sessionSummary(final)).toBe(sessionSummary(replayed.session));
  });

  it("fills a stop touched intrabar at the stop price", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      bar("2026-09-03", 9500, 9600, 8900, 9400),
    ];
    const states = stepAll(scripted([entry(9000), NO_SIGNAL, NO_SIGNAL]), bars);
    const final = states[states.length - 1] as PaperSessionState;
    expect(final.ledger[0]).toMatchObject({ exitReason: "stop", exitRawPricePaise: 9000 });
  });

  it("fills target gap-through and intrabar touches at the target rule prices", () => {
    const gapBars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      bar("2026-09-03", 11100, 11200, 11000, 11100),
    ];
    const gap = stepAll(scripted([entry(9000, 11000), NO_SIGNAL, NO_SIGNAL]), gapBars);
    expect(gap[gap.length - 1]?.ledger[0]).toMatchObject({
      exitReason: "target",
      exitRawPricePaise: 11100,
    });

    const touchBars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      bar("2026-09-03", 10500, 11100, 10400, 10600),
    ];
    const touch = stepAll(scripted([entry(9000, 11000), NO_SIGNAL, NO_SIGNAL]), touchBars);
    expect(touch[touch.length - 1]?.ledger[0]).toMatchObject({
      exitReason: "target",
      exitRawPricePaise: 11000,
    });
  });

  it("resolves same-bar stop/target conflict stop-first", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      // Open clears both, low hits the stop, high hits the target.
      bar("2026-09-03", 9500, 11200, 8900, 10000),
    ];
    const states = stepAll(scripted([entry(9000, 11000), NO_SIGNAL, NO_SIGNAL]), bars);
    expect(states[states.length - 1]?.ledger[0]).toMatchObject({
      exitReason: "stop",
      exitRawPricePaise: 9000,
    });
  });

  it("evaluates the entry bar for protective exit under the same rule", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      // Entry at the 10000 open (fill 10005, stop 9950 protective), low gaps the stop.
      bar("2026-09-02", 10000, 10050, 9900, 9950),
    ];
    const states = stepAll(scripted([entry(9950), NO_SIGNAL]), bars);
    const final = states[states.length - 1] as PaperSessionState;
    expect(final.open).toBeNull();
    expect(final.ledger[0]).toMatchObject({
      entryDate: "2026-09-02",
      exitDate: "2026-09-02",
      exitReason: "stop",
      exitRawPricePaise: 9950,
    });
    expect(final.diagnostics.entriesExecuted).toBe(1);
  });

  it("rejects non-protective stops without opening", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
    ];
    const states = stepAll(scripted([entry(20000), NO_SIGNAL]), bars);
    const final = states[states.length - 1] as PaperSessionState;
    expect(final.open).toBeNull();
    expect(final.ledger).toEqual([]);
    expect(final.rejectedEntries).toHaveLength(1);
    expect(final.rejectedEntries[0]).toMatchObject({
      date: "2026-09-02",
      reason: "non-protective-stop",
    });
  });

  it("prefers protective exits over pending signal exits", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      // Exit signal at the d2 close becomes pending; d3 gaps the stop first.
      bar("2026-09-03", 8900, 9000, 8800, 8900),
    ];
    const states = stepAll(scripted([entry(9000), EXIT, NO_SIGNAL]), bars);
    expect(states[states.length - 1]?.ledger[0]).toMatchObject({ exitReason: "stop" });
  });
});

describe("frontier semantics", () => {
  it("holds open positions without manufacturing a forced close", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      bar("2026-09-03", 10000, 10100, 9900, 10300),
    ];
    const evaluate = scripted([entry(9000), NO_SIGNAL, EXIT]);
    const states = stepAll(evaluate, bars);
    const final = states[states.length - 1] as PaperSessionState;
    // Exit signal lands on the frontier close: still open, pending exit.
    expect(final.open?.entryDate).toBe("2026-09-02");
    expect(final.pending).toEqual({ kind: "exit" });
    expect(final.ledger).toEqual([]);
    // Extending the run exits normally at the next open — never forced.
    const extended = okStep(stepPaper(final, bar("2026-09-04", 10400, 10500, 10300, 10400)));
    expect(extended.open).toBeNull();
    expect(extended.ledger[0]).toMatchObject({
      entryDate: "2026-09-02",
      exitDate: "2026-09-04",
      exitReason: "signal",
      forcedExitAtEnd: false,
    });
    // And the extended chain still equals replay of the same bars.
    const replayed = replayPaperSession(configFor(evaluate), [
      ...bars,
      bar("2026-09-04", 10400, 10500, 10300, 10400),
    ]);
    expect(replayed.status).toBe("ok");
    if (replayed.status !== "ok") {
      return;
    }
    expect(sessionSummary(extended)).toBe(sessionSummary(replayed.session));
  });

  it("keeps unrealized P&L derived, never stored", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
    ];
    const states = stepAll(scripted([entry(9000), NO_SIGNAL]), bars);
    const final = states[states.length - 1] as PaperSessionState;
    expect(final.open).not.toBeNull();
    expect(paperUnrealizedPaise(final)).toBe(10000 - 10005);
    expect(JSON.stringify(final)).not.toContain("unrealizedPnlPaise");
  });
});

describe("strategy visibility", () => {
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
    const states = stepAll(observing, bars);
    expect(maxSeen).toBe(3);
    expect(states[states.length - 1]?.bars).toHaveLength(3);
  });
});
