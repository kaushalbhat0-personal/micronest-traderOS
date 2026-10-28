import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PAPER_BROKERAGE_PAISE,
  PAPER_QUANTITY,
  PAPER_SLIPPAGE_BPS,
  PAPER_STARTING_CASH_PAISE,
  appendPaperBar,
  createPaperSession,
  paperTradeId,
  paperUnrealizedPaise,
  replayPaperSession,
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

function entry(stop: number): StrategyDecision {
  return {
    kind: "entry",
    direction: "long",
    stopPaise: stop,
    targetPaise: null,
    note: "paper test entry",
  };
}

const EXIT: StrategyDecision = { kind: "exit", note: "paper test exit" };

/** Stateless scripted strategy (test-only): decision per close index. */
function scripted(decisions: StrategyDecision[]): StrategyEvaluate {
  return (context): StrategyDecision => decisions[context.bars.length - 1] ?? NO_SIGNAL;
}

function configFor(evaluate: StrategyEvaluate): PaperSessionConfig {
  return {
    startingCashPaise: PAPER_STARTING_CASH_PAISE,
    quantity: PAPER_QUANTITY,
    slippageBps: PAPER_SLIPPAGE_BPS,
    brokeragePaise: PAPER_BROKERAGE_PAISE,
    evaluate,
    params: STRATEGY_LAB_REFERENCE_PARAMS,
  };
}

function okSession(result: ReturnType<typeof replayPaperSession>): PaperSessionState {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") {
    throw new Error("expected ok paper session");
  }
  return result.session;
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

describe("M2-A session config", () => {
  it("freezes the specified paper values", () => {
    expect(PAPER_STARTING_CASH_PAISE).toBe(10_000_000);
    expect(PAPER_QUANTITY).toBe(1);
    expect(PAPER_SLIPPAGE_BPS).toBe(5);
    expect(PAPER_BROKERAGE_PAISE).toBe(2_000);
  });

  it("creates an empty session with starting cash and no position", () => {
    const session = okSession(createPaperSession(configFor(evaluateSmaCross)));
    expect(session.cashPaise).toBe(10_000_000);
    expect(session.realizedPnlPaise).toBe(0);
    expect(session.ledger).toEqual([]);
    expect(session.open).toBeNull();
    expect(session.pending).toBeNull();
    expect(session.lastProcessedDate).toBeNull();
  });

  it("rejects invalid config deterministically", () => {
    const base = configFor(evaluateSmaCross);
    expect(createPaperSession({ ...base, quantity: 0 }).status).toBe("invalid");
    expect(createPaperSession({ ...base, slippageBps: 7 }).status).toBe("invalid");
    expect(createPaperSession({ ...base, brokeragePaise: -1 }).status).toBe("invalid");
    expect(createPaperSession({ ...base, startingCashPaise: -5 }).status).toBe("invalid");
    expect(
      createPaperSession({ ...base, params: { ...base.params, fastPeriod: 30, slowPeriod: 10 } })
        .status,
    ).toBe("invalid");
  });
});

describe("fixture replay and synthetic limitation", () => {
  it("replays the 15-bar fixture with zero completed trades (strategy warmup is 30 bars)", () => {
    const bars = fixtureBars();
    expect(bars).toHaveLength(15);
    const session = okSession(replayPaperSession(configFor(evaluateSmaCross), bars));

    expect(session.symbol).toBe("DEMO");
    expect(session.lastProcessedDate).toBe("2026-09-21");
    expect(session.ledger).toEqual([]);
    expect(session.realizedPnlPaise).toBe(0);
    expect(session.cashPaise).toBe(10_000_000);
    expect(session.open).toBeNull();
    expect(session.pending).toBeNull();
  });

  it("reproduces the frozen M1-C 5 bps reference result exactly", () => {
    const bars = fixtureBars();
    const session = okSession(replayPaperSession(configFor(evaluateSmaCross), bars));
    const direct = runBacktest({
      bars,
      evaluate: evaluateSmaCross,
      params: STRATEGY_LAB_REFERENCE_PARAMS,
      quantity: 1,
      slippageBps: 5,
      brokeragePaise: 2000,
    });
    expect(direct.status).toBe("ok");
    if (direct.status !== "ok") {
      return;
    }
    expect(JSON.stringify(session.ledger)).toBe(JSON.stringify([]));
    expect(JSON.stringify(direct.trades)).toBe(JSON.stringify([]));
    expect(JSON.stringify(session.diagnostics)).toBe(JSON.stringify(direct.diagnostics));
    expect(JSON.stringify(session.rejectedEntries)).toBe(JSON.stringify(direct.rejectedEntries));
  });

  it("is byte-identical for repeated fixture replays", () => {
    const bars = fixtureBars();
    const first = JSON.stringify(okSession(replayPaperSession(configFor(evaluateSmaCross), bars)));
    const second = JSON.stringify(okSession(replayPaperSession(configFor(evaluateSmaCross), bars)));
    expect(second).toBe(first);
  });

  it("never mutates the input bars", () => {
    const bars = fixtureBars();
    const before = JSON.stringify(bars);
    okSession(replayPaperSession(configFor(evaluateSmaCross), bars));
    expect(JSON.stringify(bars)).toBe(before);
  });
});

describe("completed trade ledger", () => {
  // Entry signal close d1 → entry d2 open 10000; exit signal close d3 → exit d4 open.
  const bars = [
    bar("2026-09-01", 10000, 10100, 9900, 10000),
    bar("2026-09-02", 10000, 10100, 9900, 10000),
    bar("2026-09-03", 10000, 10100, 9900, 10000),
    bar("2026-09-04", 11000, 11100, 10900, 11000),
  ];
  const evaluate = scripted([entry(9000), NO_SIGNAL, EXIT, NO_SIGNAL]);

  it("records the completed trade economics verbatim from M1-C", () => {
    const session = okSession(replayPaperSession(configFor(evaluate), bars));
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
    expect(direct.trades).toHaveLength(1);
    expect(session.ledger).toHaveLength(1);
    const [entry_] = session.ledger;
    const [trade] = direct.trades;
    expect(entry_).toBeDefined();
    expect(trade).toBeDefined();
    if (entry_ === undefined || trade === undefined) {
      return;
    }
    const { id, ...rest } = entry_;
    expect(id).toBe(paperTradeId(trade));
    expect(id).toBe("2026-09-02>2026-09-04");
    expect(rest).toEqual(trade);
  });

  it("accumulates realized P&L into fictional cash", () => {
    const session = okSession(replayPaperSession(configFor(evaluate), bars));
    const [entry_] = session.ledger;
    expect(session.realizedPnlPaise).toBe(entry_?.netPnlPaise);
    expect(session.cashPaise).toBe(10_000_000 + (entry_?.netPnlPaise ?? 0));
    expect(session.open).toBeNull();
    expect(session.pending).toBeNull();
  });

  it("agrees with M1-C on diagnostics and rejections", () => {
    const session = okSession(replayPaperSession(configFor(evaluate), bars));
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
    expect(session.diagnostics).toEqual(direct.diagnostics);
    expect(session.rejectedEntries).toEqual(direct.rejectedEntries);
  });
});

describe("open position and frontier rule", () => {
  // Entry executes d2 open; exit signal lands on the final close d3, so the
  // position is genuinely open at the frontier: M1-C force-closes it as a
  // truncation artifact, and paper must hold it open instead of ledgering it.
  const bars = [
    bar("2026-09-01", 10000, 10100, 9900, 10000),
    bar("2026-09-02", 10000, 10100, 9900, 10000),
    bar("2026-09-03", 10000, 10100, 9900, 10300),
  ];
  const evaluate = scripted([entry(9000), NO_SIGNAL, EXIT]);

  it("holds the provisional forced-final as an open position, not a ledger entry", () => {
    const session = okSession(replayPaperSession(configFor(evaluate), bars));
    expect(session.ledger).toEqual([]);
    expect(session.realizedPnlPaise).toBe(0);
    expect(session.cashPaise).toBe(10_000_000);
    expect(session.open).toMatchObject({
      symbol: "DEMO",
      side: "long",
      quantity: 1,
      entryDate: "2026-09-02",
      entryFillPaise: 10005,
      stopPaise: 9000,
      targetPaise: null,
      status: "open",
    });
    expect(session.pending).toEqual({ kind: "exit" });
  });

  it("derives read-time unrealized P&L without storing it", () => {
    const session = okSession(replayPaperSession(configFor(evaluate), bars));
    // (10300 − 10005) × 1.
    expect(paperUnrealizedPaise(session)).toBe(295);
    expect(session.open).not.toHaveProperty("unrealizedPnlPaise");
  });

  it("reports null unrealized P&L when flat", () => {
    const flat = okSession(
      replayPaperSession(configFor(scripted([NO_SIGNAL, NO_SIGNAL])), bars.slice(0, 2)),
    );
    expect(paperUnrealizedPaise(flat)).toBeNull();
  });
});

describe("pending entry intent", () => {
  it("exposes an entry signal on the final bar as a pending intent", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
    ];
    const session = okSession(
      replayPaperSession(configFor(scripted([NO_SIGNAL, entry(9000)])), bars),
    );
    expect(session.open).toBeNull();
    expect(session.ledger).toEqual([]);
    expect(session.pending).toEqual({ kind: "entry", stopPaise: 9000, targetPaise: null });
  });
});

describe("rejected entries", () => {
  it("preserves M1-C non-protective-stop rejections verbatim", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
    ];
    const evaluate = scripted([entry(20000), NO_SIGNAL]);
    const session = okSession(replayPaperSession(configFor(evaluate), bars));
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
    expect(session.rejectedEntries).toEqual(direct.rejectedEntries);
    expect(session.rejectedEntries).toHaveLength(1);
    expect(session.ledger).toEqual([]);
    expect(session.open).toBeNull();
  });
});

describe("idempotent and monotonic bars", () => {
  it("returns the same session when the identical bar is re-appended", () => {
    const created = createPaperSession(configFor(scripted([NO_SIGNAL, NO_SIGNAL])));
    expect(created.status).toBe("ok");
    if (created.status !== "ok") {
      return;
    }
    const first = appendPaperBar(created.session, bar("2026-09-01", 10000, 10100, 9900, 10000));
    expect(first.status).toBe("ok");
    if (first.status !== "ok") {
      return;
    }
    const again = appendPaperBar(first.session, bar("2026-09-01", 10000, 10100, 9900, 10000));
    expect(again.status).toBe("ok");
    if (again.status !== "ok") {
      return;
    }
    expect(again.session).toBe(first.session);
  });

  it("replaying the frontier bar never duplicates ledger entries", () => {
    const bars = [
      bar("2026-09-01", 10000, 10100, 9900, 10000),
      bar("2026-09-02", 10000, 10100, 9900, 10000),
      bar("2026-09-03", 10000, 10100, 9900, 10000),
      bar("2026-09-04", 11000, 11100, 10900, 11000),
    ];
    const evaluate = scripted([entry(9000), NO_SIGNAL, EXIT, NO_SIGNAL]);
    const once = okSession(replayPaperSession(configFor(evaluate), bars));
    const created = createPaperSession(configFor(evaluate));
    expect(created.status).toBe("ok");
    if (created.status !== "ok") {
      return;
    }
    let session = created.session;
    for (const repeat of [...bars, bars[3], bars[3]]) {
      const next = appendPaperBar(session, repeat as Bar);
      expect(next.status).toBe("ok");
      if (next.status !== "ok") {
        return;
      }
      session = next.session;
    }
    expect(session.ledger).toEqual(once.ledger);
    expect(JSON.stringify(session)).toBe(JSON.stringify(once));
  });

  it("rejects older dates, divergent bars, foreign symbols, and bad dates", () => {
    const created = createPaperSession(configFor(scripted([NO_SIGNAL, NO_SIGNAL, NO_SIGNAL])));
    expect(created.status).toBe("ok");
    if (created.status !== "ok") {
      return;
    }
    const first = appendPaperBar(created.session, bar("2026-09-02", 10000, 10100, 9900, 10000));
    expect(first.status).toBe("ok");
    if (first.status !== "ok") {
      return;
    }
    expect(appendPaperBar(first.session, bar("2026-09-01", 10000, 10100, 9900, 10000)).status).toBe(
      "invalid",
    );
    expect(appendPaperBar(first.session, bar("2026-09-02", 10001, 10100, 9900, 10000)).status).toBe(
      "invalid",
    );
    expect(
      appendPaperBar(first.session, {
        ...bar("2026-09-03", 10000, 10100, 9900, 10000),
        symbol: "X",
      }).status,
    ).toBe("invalid");
    expect(
      appendPaperBar(first.session, {
        ...bar("2026-09-03", 10000, 10100, 9900, 10000),
        date: "bad",
      }).status,
    ).toBe("invalid");
  });
});

describe("paper domain purity", () => {
  const source = readFileSync(join(process.cwd(), "features", "strategy-lab", "paper.ts"), "utf8");

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

  it("imports only frozen strategy-lab contracts", () => {
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const specifier = match[1] as string;
      if (specifier.startsWith("@/features/")) {
        expect(specifier.startsWith("@/features/strategy-lab/")).toBe(true);
      }
      expect(specifier.startsWith("node:")).toBe(false);
    }
  });
});
