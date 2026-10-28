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
  acceptedEvents,
  createMarketStream,
  recoverMarketStream,
  runMarketStream,
  runMarketStreamFaults,
  streamDuplicate,
  streamEmitEvent,
  streamEmitNext,
  type MarketStreamState,
} from "@/features/strategy-lab/market-stream";
import { STRATEGY_LAB_REFERENCE_PARAMS } from "@/features/strategy-lab/types";
import type { Bar } from "@/features/strategy-lab/types";
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
  return { kind: "entry", direction: "long", stopPaise: stop, targetPaise: null, note: "stream" };
}

const EXIT: StrategyDecision = { kind: "exit", note: "stream exit" };

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

function directChain(config: PaperSessionConfig, bars: readonly Bar[]): PaperSessionState {
  let session = freshSession(config);
  for (const next of bars) {
    const result = stepPaper(session, next);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error("expected ok direct step");
    }
    session = result.session;
  }
  return session;
}

function okStream(result: { status: string; stream: MarketStreamState }): MarketStreamState {
  expect(result.status).toBe("ok");
  if (result.status !== "ok" || !("stream" in result)) {
    throw new Error("expected ok stream");
  }
  return result.stream;
}

const ROUND_TRIP = [
  bar("2026-09-01", 10000, 10100, 9900, 10000),
  bar("2026-09-02", 10000, 10100, 9900, 10000),
  bar("2026-09-03", 10000, 10100, 9900, 10000),
  bar("2026-09-04", 11000, 11100, 10900, 11000),
];
const ROUND_TRIP_EVAL = scripted([entry(9000), NO_SIGNAL, EXIT, NO_SIGNAL]);

describe("sequential equivalence", () => {
  it("matches direct stepPaper chains on the full run", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    const stream = okStream(runMarketStream(createMarketStream(ROUND_TRIP, freshSession(config))));
    expect(summary(stream.session)).toBe(summary(directChain(config, ROUND_TRIP)));
    expect(stream.ack).toBe(ROUND_TRIP.length);
    expect(stream.cursor).toBe(ROUND_TRIP.length);
    expect(stream.log).toHaveLength(ROUND_TRIP.length);
    expect(stream.log.every((entry) => entry.kind === "emitted" && entry.accepted)).toBe(true);
  });

  it("matches direct prefixes after every bar", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    let stream = createMarketStream(ROUND_TRIP, freshSession(config));
    let direct = freshSession(config);
    ROUND_TRIP.forEach((next, index) => {
      stream = okStream(streamEmitNext(stream));
      const result = stepPaper(direct, next);
      expect(result.status).toBe("ok");
      if (result.status !== "ok") {
        throw new Error("expected ok direct step");
      }
      direct = result.session;
      expect(summary(stream.session), `prefix ${index}`).toBe(summary(direct));
    });
  });

  it("is byte-identical across repeated runs", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    const first = okStream(runMarketStream(createMarketStream(ROUND_TRIP, freshSession(config))));
    const second = okStream(runMarketStream(createMarketStream(ROUND_TRIP, freshSession(config))));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe("duplicate handling", () => {
  it("treats identical duplicates as idempotent no-ops", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    let stream = createMarketStream(ROUND_TRIP, freshSession(config));
    stream = okStream(streamEmitNext(stream));
    const before = stream.session;
    const beforeLedger = JSON.stringify(before.ledger);
    stream = okStream(streamDuplicate(stream));
    expect(stream.session).toBe(before);
    expect(JSON.stringify(stream.session.ledger)).toBe(beforeLedger);
    expect(stream.log[stream.log.length - 1]).toMatchObject({ kind: "emitted", noop: true });
  });

  it("rejects divergent duplicates without mutating state", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    let stream = createMarketStream(ROUND_TRIP, freshSession(config));
    stream = okStream(streamEmitNext(stream));
    const before = stream.session;
    const divergent = { ...ROUND_TRIP[0], openPaise: 9999 } as Bar;
    const result = streamEmitEvent(stream, divergent);
    expect(result.status).toBe("invalid");
    expect(result.stream.session).toBe(before);
    expect(result.stream.log[result.stream.log.length - 1]).toMatchObject({ kind: "rejected" });
    expect(JSON.stringify(result.stream.session)).toBe(JSON.stringify(before));
  });
});

describe("out-of-order and missing bars", () => {
  it("rejects out-of-order events", () => {
    const config = fixedConfigFor(scripted([NO_SIGNAL, NO_SIGNAL, NO_SIGNAL]));
    let stream = createMarketStream(ROUND_TRIP, freshSession(config));
    stream = okStream(streamEmitEvent(stream, ROUND_TRIP[2] as Bar));
    const before = stream.session;
    const result = streamEmitEvent(stream, ROUND_TRIP[1] as Bar);
    expect(result.status).toBe("invalid");
    expect(result.stream.session).toBe(before);
  });

  it("skips without synthesizing and equals the gapped direct chain", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    const stream = okStream(
      runMarketStreamFaults(createMarketStream(ROUND_TRIP, freshSession(config)), [
        { op: "emit" },
        { op: "skip" },
        { op: "emit" },
        { op: "emit" },
      ]),
    );
    const gapped = [ROUND_TRIP[0], ROUND_TRIP[2], ROUND_TRIP[3]] as Bar[];
    expect(summary(stream.session)).toBe(summary(directChain(config, gapped)));
    expect(stream.log[1]).toMatchObject({ kind: "skipped", emitted: false });
    expect(stream.ack).toBe(3);
  });
});

describe("halt, resume, and restart", () => {
  it("halts without mutation and resumes to the uninterrupted result", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    const full = okStream(runMarketStream(createMarketStream(ROUND_TRIP, freshSession(config))));
    const partial = okStream(
      runMarketStreamFaults(createMarketStream(ROUND_TRIP, freshSession(config)), [
        { op: "emit" },
        { op: "emit" },
        { op: "halt" },
        { op: "emit" },
        { op: "resume" },
        { op: "emit" },
        { op: "emit" },
      ]),
    );
    expect(summary(partial.session)).toBe(summary(full.session));
    expect(partial.log.some((entry) => entry.kind === "halted")).toBe(true);
  });

  it("recovers from the acknowledged cursor and continues identically", () => {
    const config = fixedConfigFor(ROUND_TRIP_EVAL);
    let stream = createMarketStream(ROUND_TRIP, freshSession(config));
    stream = okStream(streamEmitNext(stream));
    stream = okStream(streamEmitNext(stream));
    const recovered = recoverMarketStream(freshSession(config), acceptedEvents(stream));
    expect(recovered.status).toBe("ok");
    if (recovered.status !== "ok") {
      throw new Error("expected ok recovery");
    }
    expect(summary(recovered.session)).toBe(summary(stream.session));
    // Continue from the recovered session over the remaining bars.
    const remaining = ROUND_TRIP.slice(stream.session.bars.length);
    const continued = directChainFrom(recovered.session, remaining);
    const full = okStream(runMarketStream(createMarketStream(ROUND_TRIP, freshSession(config))));
    expect(summary(continued)).toBe(summary(full.session));
  });
});

function directChainFrom(session: PaperSessionState, bars: readonly Bar[]): PaperSessionState {
  let current = session;
  for (const next of bars) {
    const result = stepPaper(current, next);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error("expected ok direct step");
    }
    current = result.session;
  }
  return current;
}

describe("end of sequence", () => {
  it("holds open positions without a forced close", () => {
    const evaluate = scripted([entry(9000), NO_SIGNAL, EXIT]);
    const bars = ROUND_TRIP.slice(0, 3);
    const config = fixedConfigFor(evaluate);
    const stream = okStream(runMarketStream(createMarketStream(bars, freshSession(config))));
    expect(stream.session.open?.entryDate).toBe("2026-09-02");
    expect(stream.session.ledger).toEqual([]);
    expect(stream.session.pending).toEqual({ kind: "exit" });
  });
});

describe("risk-guard preservation through the stream", () => {
  it("keeps blocked entries blocked with no economic effect", () => {
    const evaluate = scripted([entry(11000), NO_SIGNAL]);
    const bars = ROUND_TRIP.slice(0, 2);
    const config = riskConfigFor(evaluate);
    const stream = okStream(runMarketStream(createMarketStream(bars, freshSession(config))));
    expect(stream.session.open).toBeNull();
    expect(stream.session.ledger).toEqual([]);
    expect(stream.session.cashPaise).toBe(PAPER_STARTING_CASH_PAISE);
    expect(stream.session.riskBlocks).toHaveLength(1);
    expect(stream.session.riskBlocks[0]).toMatchObject({ code: "invalid_stop" });
  });

  it("sizes approved entries through the stream exactly as direct stepping", () => {
    const evaluate = scripted([entry(9000), NO_SIGNAL]);
    const bars = ROUND_TRIP.slice(0, 2);
    const config = riskConfigFor(evaluate);
    const stream = okStream(runMarketStream(createMarketStream(bars, freshSession(config))));
    expect(stream.session.open?.quantity).toBe(100);
    expect(summary(stream.session)).toBe(summary(directChain(config, bars)));
  });
});

describe("no future leakage", () => {
  it("never shows the strategy a future bar", () => {
    let maxSeen = 0;
    const observing: StrategyEvaluate = (context) => {
      maxSeen = Math.max(maxSeen, context.bars.length);
      return NO_SIGNAL;
    };
    const config = fixedConfigFor(observing);
    okStream(runMarketStream(createMarketStream(ROUND_TRIP, freshSession(config))));
    expect(maxSeen).toBe(ROUND_TRIP.length);
  });
});

describe("stream domain purity", () => {
  const source = readFileSync(
    join(process.cwd(), "features", "strategy-lab", "market-stream.ts"),
    "utf8",
  );

  it("has no clock, randomness, network, or persistence dependency", () => {
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
    ]) {
      expect(source, `forbidden token: ${token}`).not.toContain(token);
    }
  });

  it("imports only frozen strategy-lab contracts and never RiskGuard", () => {
    expect(source).not.toContain("risk-guard");
    expect(source).not.toContain("decidePosition");
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const specifier = match[1] as string;
      if (specifier.startsWith("@/features/")) {
        expect(specifier.startsWith("@/features/strategy-lab/")).toBe(true);
      }
      expect(specifier.startsWith("node:")).toBe(false);
    }
  });
});
