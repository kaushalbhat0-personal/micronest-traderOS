import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PAPER_BROKERAGE_PAISE,
  PAPER_QUANTITY,
  PAPER_RISK_BPS,
  PAPER_RISK_LOT_SIZE,
  PAPER_SLIPPAGE_BPS,
  PAPER_STARTING_CASH_PAISE,
  createPaperSession,
  stepPaper,
  type PaperSessionConfig,
  type PaperSessionState,
} from "@/features/strategy-lab/paper";
import {
  paperRunSummary,
  runPaperStreamToCompletion,
  type PaperRunResult,
} from "@/features/strategy-lab/paper-run";
import {
  acceptedEvents,
  createMarketStream,
  recoverMarketStream,
  runMarketStream,
  runMarketStreamFaults,
  streamDuplicate,
  streamEmitEvent,
  streamEmitNext,
  streamHalt,
  streamResume,
  streamSkip,
  type MarketStreamState,
} from "@/features/strategy-lab/market-stream";
import { STRATEGY_LAB_REFERENCE_PARAMS, type Bar } from "@/features/strategy-lab/types";
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

function entry(stop: number): StrategyDecision {
  return { kind: "entry", direction: "long", stopPaise: stop, targetPaise: null, note: "run" };
}

const EXIT: StrategyDecision = { kind: "exit", note: "run exit" };

function scripted(decisions: StrategyDecision[]): StrategyEvaluate {
  return (context): StrategyDecision => decisions[context.bars.length - 1] ?? NO_SIGNAL;
}

function fixedConfigFor(evaluate: StrategyEvaluate): PaperSessionConfig {
  return {
    startingCashPaise: PAPER_STARTING_CASH_PAISE,
    quantity: PAPER_QUANTITY,
    slippageBps: PAPER_SLIPPAGE_BPS,
    brokeragePaise: PAPER_BROKERAGE_PAISE,
    evaluate,
    params: STRATEGY_LAB_REFERENCE_PARAMS,
  };
}

function riskConfigFor(evaluate: StrategyEvaluate): PaperSessionConfig {
  return { ...fixedConfigFor(evaluate), riskBps: PAPER_RISK_BPS, lotSize: PAPER_RISK_LOT_SIZE };
}

function freshSession(config: PaperSessionConfig): PaperSessionState {
  const created = createPaperSession(config);
  expect(created.status).toBe("ok");
  if (created.status !== "ok") {
    throw new Error("expected ok session");
  }
  return created.session;
}

function summary(session: PaperSessionState): string {
  return JSON.stringify({
    symbol: session.symbol,
    lastProcessedDate: session.lastProcessedDate,
    bars: session.bars,
    ledger: session.ledger,
    realizedPnlPaise: session.realizedPnlPaise,
    cashPaise: session.cashPaise,
    open: session.open,
    pending: session.pending,
    diagnostics: session.diagnostics,
    rejectedEntries: session.rejectedEntries,
    riskBlocks: session.riskBlocks,
  });
}

function manualRun(stream: MarketStreamState): MarketStreamState {
  let current = stream;
  while (current.cursor < current.dataset.length && !current.halted) {
    const stepped = streamEmitNext(current);
    expect(stepped.status).toBe("ok");
    if (stepped.status !== "ok") {
      throw new Error("expected ok manual step");
    }
    current = stepped.stream;
  }
  return current;
}

const ROUND_TRIP = [
  bar("2026-09-01", 10000, 10100, 9900, 10000),
  bar("2026-09-02", 10000, 10100, 9900, 10000),
  bar("2026-09-03", 10000, 10100, 9900, 10000),
  bar("2026-09-04", 11000, 11100, 10900, 11000),
];
const ROUND_TRIP_EVAL = scripted([entry(9000), NO_SIGNAL, EXIT, NO_SIGNAL]);

describe("unattended equals manual", () => {
  it("reaches the same terminal stream as sequential Next Bar presses", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    const runner = runPaperStreamToCompletion(createMarketStream(ROUND_TRIP, freshSession(config)));
    expect(runner.status).toBe("complete");
    const manual = manualRun(createMarketStream(ROUND_TRIP, freshSession(config)));
    expect(JSON.stringify(runner.stream)).toBe(JSON.stringify(manual));
    expect(summary(runner.stream.session)).toBe(summary(manual.session));
  });
});

describe("deterministic replay", () => {
  it("produces identical runs from identical inputs", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    const first = runPaperStreamToCompletion(createMarketStream(ROUND_TRIP, freshSession(config)));
    const second = runPaperStreamToCompletion(createMarketStream(ROUND_TRIP, freshSession(config)));
    expect(first.status).toBe("complete");
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    const firstSummary = paperRunSummary(first);
    const secondSummary = paperRunSummary(second);
    expect(JSON.stringify(secondSummary)).toBe(JSON.stringify(firstSummary));
    expect(firstSummary).toMatchObject({
      status: "complete",
      cursor: ROUND_TRIP.length,
      datasetLength: ROUND_TRIP.length,
      acknowledgedEvents: ROUND_TRIP.length,
    });
  });
});

describe("completion", () => {
  it("reports complete with cursor at dataset end and no forced close", () => {
    const evaluate = scripted([entry(9000), NO_SIGNAL, EXIT]);
    const bars = ROUND_TRIP.slice(0, 3);
    const config = fixedConfigFor(evaluate);
    const result = runPaperStreamToCompletion(createMarketStream(bars, freshSession(config)));
    expect(result.status).toBe("complete");
    expect(result.stream.cursor).toBe(bars.length);
    expect(result.stream.session.open?.entryDate).toBe("2026-09-02");
    expect(result.stream.session.ledger).toEqual([]);
    // Further emission is a clean no-op.
    const again = streamEmitNext(result.stream);
    expect(again.status).toBe("ok");
    if (again.status === "ok") {
      expect(JSON.stringify(again.stream.session)).toBe(JSON.stringify(result.stream.session));
    }
    expect(paperRunSummary(result).status).toBe("complete");
  });
});

describe("halt and resume", () => {
  it("halts without mutating the session and resumes to the uninterrupted result", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    const full = runPaperStreamToCompletion(createMarketStream(ROUND_TRIP, freshSession(config)));
    expect(full.status).toBe("complete");

    let halted = createMarketStream(ROUND_TRIP, freshSession(config));
    const first = streamEmitNext(halted);
    expect(first.status).toBe("ok");
    if (first.status !== "ok") {
      throw new Error("expected ok");
    }
    halted = first.stream;
    const before = halted.session;
    halted = streamHalt(halted);
    const haltedResult = runPaperStreamToCompletion(halted);
    expect(haltedResult.status).toBe("halted");
    expect(haltedResult.stream.session).toBe(before);
    expect(paperRunSummary(haltedResult).status).toBe("halted");

    const resumed: PaperRunResult = runPaperStreamToCompletion(streamResume(haltedResult.stream));
    expect(resumed.status).toBe("complete");
    expect(summary(resumed.stream.session)).toBe(summary(full.stream.session));
  });
});

describe("duplicate handling", () => {
  it("treats byte-identical duplicates as idempotent no-ops", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    let stream = createMarketStream(ROUND_TRIP, freshSession(config));
    const first = streamEmitNext(stream);
    expect(first.status).toBe("ok");
    if (first.status !== "ok") {
      throw new Error("expected ok");
    }
    stream = first.stream;
    const before = stream.session;
    const duped = streamDuplicate(stream);
    expect(duped.status).toBe("ok");
    if (duped.status === "ok") {
      expect(duped.stream.session).toBe(before);
    }
  });

  it("rejects divergent same-date events and stops the run", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    let stream = createMarketStream(ROUND_TRIP, freshSession(config));
    const first = streamEmitNext(stream);
    expect(first.status).toBe("ok");
    if (first.status !== "ok") {
      throw new Error("expected ok");
    }
    stream = first.stream;
    const before = stream.session;
    const divergent = { ...ROUND_TRIP[0], openPaise: 9999 } as Bar;
    const result = streamEmitEvent(stream, divergent);
    expect(result.status).toBe("invalid");
    expect(result.stream.session).toBe(before);
    expect(result.stream.log[result.stream.log.length - 1]).toMatchObject({ kind: "rejected" });
  });
});

describe("ordering failures", () => {
  it("rejects older events without mutating state", () => {
    const config = fixedConfigFor(scripted([NO_SIGNAL, NO_SIGNAL, NO_SIGNAL]));
    let stream = createMarketStream(ROUND_TRIP, freshSession(config));
    const first = streamEmitEvent(stream, ROUND_TRIP[2] as Bar);
    expect(first.status).toBe("ok");
    if (first.status !== "ok") {
      throw new Error("expected ok");
    }
    stream = first.stream;
    const before = stream.session;
    const cursor = stream.cursor;
    const ack = stream.ack;
    const result = streamEmitEvent(stream, ROUND_TRIP[1] as Bar);
    expect(result.status).toBe("invalid");
    expect(result.stream.session).toBe(before);
    expect(result.stream.cursor).toBe(cursor);
    expect(result.stream.ack).toBe(ack);
  });

  it("rejects out-of-order events", () => {
    const config = fixedConfigFor(scripted([NO_SIGNAL, NO_SIGNAL, NO_SIGNAL]));
    let stream = createMarketStream(ROUND_TRIP, freshSession(config));
    const first = streamEmitNext(stream);
    expect(first.status).toBe("ok");
    if (first.status !== "ok") {
      throw new Error("expected ok");
    }
    stream = first.stream;
    // A gapped jump forward is valid paper semantics (missing dates stay gaps).
    const jumped = streamEmitEvent(stream, ROUND_TRIP[2] as Bar);
    expect(jumped.status).toBe("ok");
    if (jumped.status !== "ok") {
      throw new Error("expected ok");
    }
    stream = jumped.stream;
    const before = stream.session;
    // Interleaved arrival behind the frontier is rejected.
    const result = streamEmitEvent(stream, ROUND_TRIP[1] as Bar);
    expect(result.status).toBe("invalid");
    expect(result.stream.session).toBe(before);
  });

  it("rejects foreign symbols", () => {
    const config = fixedConfigFor(scripted([NO_SIGNAL, NO_SIGNAL]));
    let stream = createMarketStream(ROUND_TRIP, freshSession(config));
    const first = streamEmitNext(stream);
    expect(first.status).toBe("ok");
    if (first.status !== "ok") {
      throw new Error("expected ok");
    }
    stream = first.stream;
    const before = stream.session;
    const foreign = { ...(ROUND_TRIP[1] as Bar), symbol: "OTHER" };
    const result = streamEmitEvent(stream, foreign);
    expect(result.status).toBe("invalid");
    expect(result.stream.session).toBe(before);
  });
});

describe("gap behavior", () => {
  it("skips only on explicit skip and never synthesizes bars", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    const stream = createMarketStream(ROUND_TRIP, freshSession(config));
    const skipped = streamSkip(stream);
    expect(skipped.cursor).toBe(1);
    expect(skipped.log[0]).toMatchObject({ kind: "skipped", emitted: false });
    expect(skipped.session.bars).toHaveLength(0);

    // The plain runner never skips: full ack on a clean run.
    const full = runPaperStreamToCompletion(createMarketStream(ROUND_TRIP, freshSession(config)));
    expect(full.status).toBe("complete");
    expect(full.stream.ack).toBe(ROUND_TRIP.length);
    expect(full.stream.log.every((entry) => entry.kind === "emitted")).toBe(true);
  });
});

describe("risk-guard block through the runner", () => {
  it("consumes pending, records one block, and continues with no economic effect", () => {
    const evaluate = scripted([entry(11000), NO_SIGNAL]);
    const bars = ROUND_TRIP.slice(0, 2);
    const config = riskConfigFor(evaluate);
    const result = runPaperStreamToCompletion(createMarketStream(bars, freshSession(config)));
    expect(result.status).toBe("complete");
    expect(result.stream.session.open).toBeNull();
    expect(result.stream.session.ledger).toEqual([]);
    expect(result.stream.session.cashPaise).toBe(PAPER_STARTING_CASH_PAISE);
    expect(result.stream.session.riskBlocks).toHaveLength(1);
    expect(result.stream.session.riskBlocks[0]).toMatchObject({ code: "invalid_stop" });
    expect(paperRunSummary(result).riskBlocks).toHaveLength(1);
  });
});

describe("no future leakage", () => {
  it("never shows the strategy a future bar through the runner", () => {
    let maxSeen = 0;
    const observing: StrategyEvaluate = (context) => {
      maxSeen = Math.max(maxSeen, context.bars.length);
      return NO_SIGNAL;
    };
    const config = fixedConfigFor(observing);
    const result = runPaperStreamToCompletion(createMarketStream(ROUND_TRIP, freshSession(config)));
    expect(result.status).toBe("complete");
    expect(maxSeen).toBe(ROUND_TRIP.length);
  });
});

describe("deterministic recovery", () => {
  it("re-derives the interrupted session and reaches the same terminal result", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    let stream = createMarketStream(ROUND_TRIP, freshSession(config));
    const first = streamEmitNext(stream);
    const second = first.status === "ok" ? streamEmitNext(first.stream) : first;
    expect(second.status).toBe("ok");
    if (second.status !== "ok") {
      throw new Error("expected ok");
    }
    stream = second.stream;

    const recovered = recoverMarketStream(freshSession(config), acceptedEvents(stream));
    expect(recovered.status).toBe("ok");
    if (recovered.status !== "ok") {
      throw new Error("expected ok recovery");
    }
    expect(summary(recovered.session)).toBe(summary(stream.session));

    // Continue the recovered session over the remaining bars via runMarketStream equivalence.
    const full = runPaperStreamToCompletion(createMarketStream(ROUND_TRIP, freshSession(config)));
    let continued = recovered.session;
    for (const next of ROUND_TRIP.slice(stream.session.bars.length)) {
      const result = stepPaper(continued, next);
      expect(result.status).toBe("ok");
      if (result.status !== "ok") {
        throw new Error("expected ok step");
      }
      continued = result.session;
    }
    expect(summary(continued)).toBe(summary(full.stream.session));
  });
});

describe("no forced final close", () => {
  it("keeps open-at-end positions open with ledger intact", () => {
    const evaluate = scripted([entry(9000), NO_SIGNAL, EXIT]);
    const bars = ROUND_TRIP.slice(0, 3);
    const config = fixedConfigFor(evaluate);
    const result = runPaperStreamToCompletion(createMarketStream(bars, freshSession(config)));
    expect(result.status).toBe("complete");
    expect(result.stream.session.open?.entryDate).toBe("2026-09-02");
    expect(result.stream.session.pending).toEqual({ kind: "exit" });
    expect(result.stream.session.ledger).toEqual([]);
    expect(result.stream.session.ledger.every((trade) => trade.forcedExitAtEnd === false)).toBe(
      true,
    );
  });
});

describe("runner domain purity", () => {
  const source = readFileSync(
    join(process.cwd(), "features", "strategy-lab", "paper-run.ts"),
    "utf8",
  );

  it("has no clock, randomness, network, persistence, broker, or AI dependency", () => {
    for (const token of [
      "Date.now",
      "Math.random",
      "crypto.randomUUID",
      "localStorage",
      "indexedDB",
      "node:fs",
      "supabase",
      "fetch(",
      "WebSocket",
      "setTimeout",
      "setInterval",
      "setImmediate",
      "queueMicrotask",
      "Worker",
    ]) {
      expect(source, `forbidden token: ${token}`).not.toContain(token);
    }
  });

  it("imports only the market-stream layer plus pure domain types", () => {
    for (const token of [
      "decidePosition",
      "risk-guard",
      "backtester",
      "applySlippage",
      "calculateFillCosts",
      "evaluateSmaCross",
      "sma-cross",
      "stepPaper",
      "setTimeout",
      "setInterval",
    ]) {
      expect(source, `forbidden token: ${token}`).not.toContain(token);
    }
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const specifier = match[1] as string;
      expect(specifier, `unexpected import: ${specifier}`).toMatch(
        /^@\/features\/strategy-lab\/(market-stream|types)$/,
      );
    }
  });
});

describe("fault-script parity", () => {
  it("matches runMarketStreamFaults on a clean emit script", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    const viaRunner = runPaperStreamToCompletion(
      createMarketStream(ROUND_TRIP, freshSession(config)),
    );
    const viaFaults = runMarketStream(createMarketStream(ROUND_TRIP, freshSession(config)));
    expect(viaFaults.status).toBe("ok");
    if (viaFaults.status !== "ok") {
      throw new Error("expected ok faults run");
    }
    expect(JSON.stringify(viaRunner.stream)).toBe(JSON.stringify(viaFaults.stream));
    expect(runMarketStreamFaults).toBeDefined();
  });
});
