import {
  BACKTEST_MAX_QUANTITY,
  runBacktest,
  type BacktestDiagnostics,
  type BacktestRejectedEntry,
  type BacktestTrade,
} from "@/features/strategy-lab/backtester";
import type { Bar, StrategyParams } from "@/features/strategy-lab/types";
import {
  parseDateField,
  parseSymbolField,
  validateStrategyParams,
} from "@/features/strategy-lab/validation";
import type { StrategyEvaluate } from "@/features/strategy-lab/strategy";

/**
 * Strategy Lab replay paper session (M2-A) — the smallest paper-trading
 * boundary over the frozen M1 stack.
 *
 * Replay and re-derivation only; there is no execution engine here. For every
 * validated bar prefix `bars[0..t]`, the frozen M1-C `runBacktest` (the
 * conformance oracle) is re-run with the locked M2-A configuration, and the
 * paper state is derived from that authoritative result: completed trades
 * become ledger entries, a terminal provisional forced-final becomes the open
 * position, and frontier signals become pending intents. Nothing here
 * reimplements fills, stops, targets, slippage, costs, or strategy logic —
 * every paise is read from an M1-C trade record.
 *
 * No clock, no randomness, no network, no persistence, no broker, no AI, no
 * RiskGuard. Restart recovery is re-derivation: reload the bars, replay the
 * prefixes, derive the identical state.
 */

/** Fictional M2-A starting paper cash: ₹1,00,000. Never real capital. */
export const PAPER_STARTING_CASH_PAISE = 10_000_000;

/** Locked M2-A quantity: one share per signal. RiskGuard is not active. */
export const PAPER_QUANTITY = 1;

/** Locked M2-A economics: the 5 bps reference leg. */
export const PAPER_SLIPPAGE_BPS = 5;

/** Locked M2-A brokerage: ₹20.00 per fill. */
export const PAPER_BROKERAGE_PAISE = 2_000;

export interface PaperIssue {
  field: string;
  reason: string;
}

export interface PaperSessionConfig {
  startingCashPaise: number;
  quantity: number;
  slippageBps: number;
  brokeragePaise: number;
  evaluate: StrategyEvaluate;
  params: StrategyParams;
}

/**
 * One ledger entry per completed M1-C trade, copied verbatim. `id` is the
 * deterministic trade identity `entryDate>exitDate` (unique under M2-A: one
 * symbol, one position, fixed quantity, no partial fills).
 */
export interface PaperLedgerEntry {
  id: string;
  entryDate: string;
  exitDate: string;
  quantity: number;
  entryRawPricePaise: number;
  exitRawPricePaise: number;
  entryFillPricePaise: number;
  exitFillPricePaise: number;
  entrySlippagePaise: number;
  exitSlippagePaise: number;
  buyStatutoryPaise: number;
  sellStatutoryPaise: number;
  grossPnlPaise: number;
  netPnlPaise: number;
  exitReason: BacktestTrade["exitReason"];
  forcedExitAtEnd: boolean;
}

export interface PaperOpenPosition {
  symbol: string;
  side: "long";
  quantity: number;
  entryDate: string;
  entryFillPaise: number;
  buyStatutoryPaise: number;
  stopPaise: number;
  targetPaise: number | null;
  status: "open";
}

export type PaperPendingIntent =
  { kind: "entry"; stopPaise: number; targetPaise: number | null } | { kind: "exit" };

export interface PaperSessionState {
  config: PaperSessionConfig;
  /** Set by the first appended bar; every later bar must match. */
  symbol: string | null;
  /** Validated history, ascending. Never mutated; replaced by copies. */
  bars: readonly Bar[];
  lastProcessedDate: string | null;
  ledger: readonly PaperLedgerEntry[];
  realizedPnlPaise: number;
  /** `startingCash + realized`. Fictional paper cash, never real capital. */
  cashPaise: number;
  open: PaperOpenPosition | null;
  pending: PaperPendingIntent | null;
  /** Current prefix diagnostics, verbatim from the oracle. */
  diagnostics: BacktestDiagnostics;
  /** Current prefix rejections, verbatim from the oracle. */
  rejectedEntries: readonly BacktestRejectedEntry[];
}

export type PaperSessionResult =
  { status: "ok"; session: PaperSessionState } | { status: "invalid"; errors: PaperIssue[] };

/** Deterministic trade identity for the M2-A single-symbol boundary. */
export function paperTradeId(trade: Pick<BacktestTrade, "entryDate" | "exitDate">): string {
  return `${trade.entryDate}>${trade.exitDate}`;
}

function toSafeNumber(value: bigint): number | null {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    return null;
  }
  return Number(value);
}

function fail(field: string, reason: string): PaperSessionResult {
  return { status: "invalid", errors: [{ field, reason }] };
}

function checkConfig(config: PaperSessionConfig): PaperIssue | null {
  if (!Number.isSafeInteger(config.startingCashPaise) || config.startingCashPaise < 0) {
    return { field: "startingCashPaise", reason: "startingCashPaise must be a safe integer ≥ 0." };
  }
  if (!Number.isSafeInteger(config.quantity) || config.quantity < 1) {
    return { field: "quantity", reason: "quantity must be a positive safe integer." };
  }
  if (config.quantity > BACKTEST_MAX_QUANTITY) {
    return { field: "quantity", reason: `quantity must not exceed ${BACKTEST_MAX_QUANTITY}.` };
  }
  if (config.slippageBps !== 0 && config.slippageBps !== 5 && config.slippageBps !== 10) {
    return { field: "slippageBps", reason: "slippageBps must be one of 0, 5, or 10." };
  }
  if (!Number.isSafeInteger(config.brokeragePaise) || config.brokeragePaise < 0) {
    return { field: "brokeragePaise", reason: "brokeragePaise must be a safe integer ≥ 0." };
  }
  if (typeof config.evaluate !== "function") {
    return { field: "evaluate", reason: "evaluate must be a strategy function." };
  }
  if (validateStrategyParams(config.params).status === "invalid") {
    return { field: "params", reason: "params must satisfy the frozen strategy relations." };
  }
  return null;
}

/** Empty session. Bars arrive later through `appendPaperBar`. */
export function createPaperSession(config: PaperSessionConfig): PaperSessionResult {
  const problem = checkConfig(config);
  if (problem !== null) {
    return { status: "invalid", errors: [problem] };
  }
  return {
    status: "ok",
    session: Object.freeze({
      config: Object.freeze({ ...config, params: Object.freeze({ ...config.params }) }),
      symbol: null,
      bars: Object.freeze([]),
      lastProcessedDate: null,
      ledger: Object.freeze([]),
      realizedPnlPaise: 0,
      cashPaise: config.startingCashPaise,
      open: null,
      pending: null,
      diagnostics: Object.freeze({
        barsProcessed: 0,
        entriesExecuted: 0,
        signalsUnexecutedAtEnd: 0,
        rejectedEntries: 0,
      }),
      rejectedEntries: Object.freeze([]),
    }),
  };
}

function toLedgerEntry(trade: BacktestTrade): PaperLedgerEntry {
  return Object.freeze({
    id: paperTradeId(trade),
    entryDate: trade.entryDate,
    exitDate: trade.exitDate,
    quantity: trade.quantity,
    entryRawPricePaise: trade.entryRawPricePaise,
    exitRawPricePaise: trade.exitRawPricePaise,
    entryFillPricePaise: trade.entryFillPricePaise,
    exitFillPricePaise: trade.exitFillPricePaise,
    entrySlippagePaise: trade.entrySlippagePaise,
    exitSlippagePaise: trade.exitSlippagePaise,
    buyStatutoryPaise: trade.buyStatutoryPaise,
    sellStatutoryPaise: trade.sellStatutoryPaise,
    grossPnlPaise: trade.grossPnlPaise,
    netPnlPaise: trade.netPnlPaise,
    exitReason: trade.exitReason,
    forcedExitAtEnd: trade.forcedExitAtEnd,
  });
}

/**
 * Derives the open paper position from a terminal provisional forced-final:
 * the exit side is a truncation artifact of the prefix (paper holds
 * overnight; it never force-closes), but the entry side is authoritative
 * M1-C economics. Stop/target are re-read from the frozen strategy at the
 * signal bar — orchestration of the pure strategy, never a recalculation.
 */
function deriveOpen(
  session: PaperSessionState,
  nextBars: readonly Bar[],
  provisional: BacktestTrade,
): PaperOpenPosition | PaperIssue {
  const entryIndex = nextBars.findIndex((bar) => bar.date === provisional.entryDate);
  if (entryIndex < 1) {
    return { field: "bars", reason: "Open position entry has no preceding signal bar." };
  }
  const decision = session.config.evaluate({
    bars: nextBars.slice(0, entryIndex),
    position: { status: "flat" },
    params: session.config.params,
  });
  if (decision.kind !== "entry") {
    return { field: "evaluate", reason: "Strategy did not reproduce its entry proposal." };
  }
  const symbol = session.symbol as string;
  return Object.freeze({
    symbol,
    side: "long",
    quantity: provisional.quantity,
    entryDate: provisional.entryDate,
    entryFillPaise: provisional.entryFillPricePaise,
    buyStatutoryPaise: provisional.buyStatutoryPaise,
    stopPaise: decision.stopPaise,
    targetPaise: decision.targetPaise,
    status: "open",
  }) as PaperOpenPosition;
}

/**
 * Derives the frontier pending intent. A counted unexecuted entry signal
 * means the session is flat with a stored entry proposal; otherwise an open
 * position re-evaluated at the frontier may carry an exit proposal.
 */
function derivePending(
  session: PaperSessionState,
  nextBars: readonly Bar[],
  unexecutedEntries: number,
  open: PaperOpenPosition | null,
): PaperPendingIntent | null | PaperIssue {
  if (unexecutedEntries > 0) {
    if (open !== null) {
      return { field: "bars", reason: "Unexecuted entry cannot coexist with an open position." };
    }
    const decision = session.config.evaluate({
      bars: nextBars,
      position: { status: "flat" },
      params: session.config.params,
    });
    if (decision.kind !== "entry") {
      return { field: "evaluate", reason: "Strategy did not reproduce its entry proposal." };
    }
    return Object.freeze({
      kind: "entry",
      stopPaise: decision.stopPaise,
      targetPaise: decision.targetPaise,
    }) as PaperPendingIntent;
  }
  if (open !== null) {
    const decision = session.config.evaluate({
      bars: nextBars,
      position: {
        status: "long",
        entryPricePaise: open.entryFillPaise,
        quantity: open.quantity,
        stopPaise: open.stopPaise,
        targetPaise: open.targetPaise,
      },
      params: session.config.params,
    });
    if (decision.kind === "exit") {
      return Object.freeze({ kind: "exit" }) as PaperPendingIntent;
    }
  }
  return null;
}

/**
 * Appends one validated bar and re-derives the whole session from the frozen
 * oracle over the extended prefix. Callers must supply M1-A-validated bars
 * (as the M2-A fixture loader does); only date/symbol/monotonicity are
 * re-checked here so no M1-A row logic is duplicated.
 *
 * Re-appending the identical bar is a no-op returning the same session;
 * anything non-monotonic or divergent is rejected deterministically.
 */
export function appendPaperBar(session: PaperSessionState, bar: Bar): PaperSessionResult {
  const date = typeof bar?.date === "string" ? parseDateField(bar.date) : null;
  if (date === null) {
    return fail("bar.date", "bar.date must be a canonical YYYY-MM-DD date.");
  }
  const symbol = typeof bar?.symbol === "string" ? parseSymbolField(bar.symbol) : null;
  if (symbol === null) {
    return fail("bar.symbol", "bar.symbol must be a valid M1 symbol.");
  }
  if (session.symbol !== null && symbol !== session.symbol) {
    return fail("bar.symbol", "bar.symbol must match the session symbol.");
  }
  const last = session.lastProcessedDate;
  if (last !== null) {
    if (date < last) {
      return fail("bar.date", "bar.date is older than the last processed bar.");
    }
    if (date === last) {
      const stored = session.bars[session.bars.length - 1] as Bar | undefined;
      if (stored !== undefined && JSON.stringify(stored) === JSON.stringify(bar)) {
        return { status: "ok", session };
      }
      return fail("bar.date", "A different bar is already recorded for this date.");
    }
  }

  const nextBars = Object.freeze([...session.bars, bar]);
  const oracle = runBacktest({
    bars: nextBars,
    evaluate: session.config.evaluate,
    params: session.config.params,
    quantity: session.config.quantity,
    slippageBps: session.config.slippageBps,
    brokeragePaise: session.config.brokeragePaise,
  });
  if (oracle.status === "invalid") {
    return { status: "invalid", errors: oracle.errors.map((e) => ({ ...e })) };
  }

  const trades = oracle.trades;
  const frontier = trades[trades.length - 1];
  const provisional =
    frontier !== undefined && frontier.forcedExitAtEnd && frontier.exitDate === date
      ? frontier
      : null;
  const completed = provisional === null ? trades : trades.slice(0, -1);

  let realized = 0n;
  for (const trade of completed) {
    realized += BigInt(trade.netPnlPaise);
  }
  const realizedPaise = toSafeNumber(realized);
  const cashPaise =
    realizedPaise === null
      ? null
      : toSafeNumber(BigInt(session.config.startingCashPaise) + BigInt(realizedPaise));
  if (realizedPaise === null || cashPaise === null) {
    return fail("ledger", "Paper accounting exceeds safe integer range.");
  }

  let open: PaperOpenPosition | null = null;
  if (provisional !== null) {
    const derived = deriveOpen(session, nextBars, provisional);
    if (!isOpenPosition(derived)) {
      return { status: "invalid", errors: [derived] };
    }
    open = derived;
  }

  const pendingOrIssue = derivePending(
    session,
    nextBars,
    oracle.diagnostics.signalsUnexecutedAtEnd,
    open,
  );
  if (pendingOrIssue !== null && !isPendingIntent(pendingOrIssue)) {
    return { status: "invalid", errors: [pendingOrIssue] };
  }

  return {
    status: "ok",
    session: Object.freeze({
      config: session.config,
      symbol: session.symbol ?? symbol,
      bars: nextBars,
      lastProcessedDate: date,
      ledger: Object.freeze(completed.map(toLedgerEntry)),
      realizedPnlPaise: realizedPaise,
      cashPaise,
      open,
      pending: pendingOrIssue,
      diagnostics: oracle.diagnostics,
      rejectedEntries: oracle.rejectedEntries,
    }),
  };
}

function isOpenPosition(value: PaperOpenPosition | PaperIssue): value is PaperOpenPosition {
  return (value as PaperOpenPosition).status === "open";
}

function isPendingIntent(value: PaperPendingIntent | PaperIssue): value is PaperPendingIntent {
  const kind = (value as PaperPendingIntent).kind;
  return kind === "entry" || kind === "exit";
}

/**
 * Replays a full validated bar array through a fresh session, prefix by
 * prefix. Returns the first invalid outcome, or the terminal session.
 */
export function replayPaperSession(
  config: PaperSessionConfig,
  bars: readonly Bar[],
): PaperSessionResult {
  const created = createPaperSession(config);
  if (created.status === "invalid") {
    return created;
  }
  let session = created.session;
  for (const bar of bars) {
    const appended = appendPaperBar(session, bar);
    if (appended.status === "invalid") {
      return appended;
    }
    session = appended.session;
  }
  return { status: "ok", session };
}

/**
 * Read-time unrealized P&L for display/status only:
 * `(lastClose − entryFill) × quantity`. Never stored, never ledgered.
 * Null when flat or outside safe integer range.
 */
export function paperUnrealizedPaise(session: PaperSessionState): number | null {
  if (session.open === null || session.bars.length === 0) {
    return null;
  }
  const last = session.bars[session.bars.length - 1] as Bar;
  const value =
    (BigInt(last.closePaise) - BigInt(session.open.entryFillPaise)) * BigInt(session.open.quantity);
  return toSafeNumber(value);
}
