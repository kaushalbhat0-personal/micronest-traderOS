import {
  BACKTEST_MAX_QUANTITY,
  runBacktest,
  type BacktestDiagnostics,
  type BacktestRejectedEntry,
  type BacktestTrade,
} from "@/features/strategy-lab/backtester";
import { applySlippage, calculateFillCosts } from "@/features/strategy-lab/costs";
// SLAB-PAPER-003 architectural exception (approved M2-D): this one-directional,
// acyclic, pure import of the RiskGuard domain function is the sole
// cross-feature import in Strategy Lab. No adapter, no generic engine, no
// execution framework — `decidePosition` is called with the next-bar raw open
// only, and its quantity is authoritative for the gated M2-D path.
import { decidePosition, type RiskGuardBlockedCode } from "@/features/risk-guard/risk-guard";
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

/** Locked M2-D RiskGuard risk budget: 100 bps (1%). */
export const PAPER_RISK_BPS = 100;

/** Locked M2-D RiskGuard lot size: 1 unit. */
export const PAPER_RISK_LOT_SIZE = 1;

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
  /**
   * M2-D RiskGuard gate. Absent → frozen M2-A/M2-B fixed-quantity path.
   * Present → gated `stepPaper` path using `decidePosition` with these
   * exact values. Both must appear together and equal the locked M2-D
   * configuration (`riskBps = 100`, `lotSize = 1`).
   */
  riskBps?: number;
  lotSize?: number;
}

/** M2-D risk-block diagnostic: a RiskGuard gate refusal. Distinct from M1-C `rejectedEntries`. */
export interface PaperRiskBlock {
  date: string;
  code: RiskGuardBlockedCode | "quantity-cap";
  reason: string;
  entryPaise: number;
  stopPaise: number;
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
  /** M2-D RiskGuard gate refusals. Empty on the frozen M2-A/M2-B path. */
  riskBlocks: readonly PaperRiskBlock[];
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
  const riskBpsSet = config.riskBps !== undefined;
  const lotSizeSet = config.lotSize !== undefined;
  if (riskBpsSet !== lotSizeSet) {
    return {
      field: "riskBps",
      reason: "riskBps and lotSize must appear together for the M2-D gate.",
    };
  }
  if (riskBpsSet && lotSizeSet) {
    if (config.riskBps !== PAPER_RISK_BPS) {
      return { field: "riskBps", reason: `riskBps must be exactly ${PAPER_RISK_BPS} for M2-D.` };
    }
    if (config.lotSize !== PAPER_RISK_LOT_SIZE) {
      return {
        field: "lotSize",
        reason: `lotSize must be exactly ${PAPER_RISK_LOT_SIZE} for M2-D.`,
      };
    }
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
      riskBlocks: Object.freeze([]),
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
      riskBlocks: session.riskBlocks ?? Object.freeze([]),
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
 * M2-B explicit single-bar stepper — incremental transition that conforms to
 * the frozen M1-C execution semantics and the frozen M2-A replay
 * interpretation.
 *
 * One call processes exactly one frontier bar: pending intents execute at the
 * bar open, protective exits (stop-first gap-through) precede signal exits,
 * the strategy evaluates at the close on `bars[0..t]`, and pendings are
 * stored for the next bar. No forced-final close is ever manufactured: a
 * position stays open until a later bar exits it, matching M2-A's
 * provisional-frontier rule.
 *
 * Numeric economics reuse the frozen primitives (`applySlippage`,
 * `calculateFillCosts`, exact BigInt P&L identities); only the per-bar
 * sequencing is re-expressed here, and it is bound by byte-equality
 * conformance tests against M2-A replay and M1-C. Entry raw/slip for a
 * future close are re-read from the stored entry bar through frozen
 * `applySlippage`, so the M2-A state shape is unchanged.
 */

type PaperProtectiveHit = { type: "stop" | "target"; raw: number };

/** M1-C protective ordering for one execution bar: gap-through, stop-first. */
function paperProtectiveExit(
  bar: Bar,
  stop: number,
  target: number | null,
): PaperProtectiveHit | null {
  if (bar.openPaise <= stop) {
    return { type: "stop", raw: bar.openPaise };
  }
  if (target !== null && bar.openPaise >= target) {
    return { type: "target", raw: bar.openPaise };
  }
  if (bar.lowPaise <= stop) {
    return { type: "stop", raw: stop };
  }
  if (target !== null && bar.highPaise >= target) {
    return { type: "target", raw: target };
  }
  return null;
}

interface PaperStepperConfig {
  quantity: number;
  slippageBps: number;
  brokeragePaise: number;
}

/**
 * Builds the completed ledger entry for a stepper close. Entry raw/slip are
 * re-read from the stored entry bar through frozen `applySlippage` and must
 * reproduce the recorded entry fill exactly; economics otherwise mirror the
 * M1-C close identity using the frozen cost pricer.
 */
function buildStepperClose(
  open: PaperOpenPosition,
  entryBarOpenPaise: number,
  exitDate: string,
  exitRaw: number,
  reason: BacktestTrade["exitReason"],
  config: PaperStepperConfig,
): PaperLedgerEntry | PaperIssue {
  const entry = applySlippage(entryBarOpenPaise, "buy", config.slippageBps);
  if (entry.fillPricePaise !== open.entryFillPaise) {
    return { field: "bars", reason: "Entry bar no longer reproduces the recorded entry fill." };
  }
  const sell = applySlippage(exitRaw, "sell", config.slippageBps);
  // M2-D: close economics use the position quantity (variable under the
  // RiskGuard gate). On the frozen M2-A/M2-B path open.quantity always equals
  // config.quantity, so this is byte-identical there.
  const quantity = open.quantity;
  const sellTurnover = sell.fillPricePaise * quantity;
  if (!Number.isSafeInteger(sellTurnover)) {
    return { field: "quantity", reason: "Exit turnover exceeds safe integer range." };
  }
  const sellStatutory = calculateFillCosts(sellTurnover, "sell", config.brokeragePaise).totalPaise;
  const grossBig = BigInt(sell.fillPricePaise - open.entryFillPaise) * BigInt(quantity);
  const gross = toSafeNumber(grossBig);
  const net = gross === null ? null : gross - (open.buyStatutoryPaise + sellStatutory);
  if (gross === null || net === null || !Number.isSafeInteger(net)) {
    return { field: "quantity", reason: "Trade P&L exceeds safe integer range." };
  }
  return Object.freeze({
    id: paperTradeId({ entryDate: open.entryDate, exitDate }),
    entryDate: open.entryDate,
    exitDate,
    quantity,
    entryRawPricePaise: entry.rawPricePaise,
    exitRawPricePaise: exitRaw,
    entryFillPricePaise: entry.fillPricePaise,
    exitFillPricePaise: sell.fillPricePaise,
    entrySlippagePaise: entry.slipPaise,
    exitSlippagePaise: sell.slipPaise,
    buyStatutoryPaise: open.buyStatutoryPaise,
    sellStatutoryPaise: sellStatutory,
    grossPnlPaise: gross,
    netPnlPaise: net,
    exitReason: reason,
    forcedExitAtEnd: false,
  });
}

/**
 * M2-D quantity resolver (the only permitted extraction). Frozen path:
 * returns the configured fixed quantity without calling RiskGuard. Gated
 * path: calls the pure `decidePosition` once with the next-bar raw open,
 * current session cash, locked riskBps/lotSize, and the verbatim pending
 * stop. The gate result (allowed quantity or block) is authoritative — there
 * is no second sizing calculation and no clamp.
 */
type EntryQuantityResolution =
  | { kind: "fixed"; quantity: number }
  | { kind: "gated-allowed"; quantity: number }
  | { kind: "gated-blocked"; code: PaperRiskBlock["code"]; reason: string };

function resolveEntryQuantity(
  config: PaperSessionConfig,
  cashPaise: number,
  rawOpenPaise: number,
  stopPaise: number,
): EntryQuantityResolution {
  if (config.riskBps === undefined || config.lotSize === undefined) {
    return { kind: "fixed", quantity: config.quantity };
  }
  const gate = decidePosition({
    capitalPaise: cashPaise,
    riskBps: config.riskBps,
    direction: "long",
    entryPaise: rawOpenPaise,
    stopPaise,
    lotSize: config.lotSize,
  });
  if (gate.status === "blocked") {
    return { kind: "gated-blocked", code: gate.code, reason: gate.reason };
  }
  if (gate.quantity < 1 || gate.quantity > BACKTEST_MAX_QUANTITY) {
    return {
      kind: "gated-blocked",
      code: "quantity-cap",
      reason: `RiskGuard quantity ${gate.quantity} exceeds maximum ${BACKTEST_MAX_QUANTITY}.`,
    };
  }
  return { kind: "gated-allowed", quantity: gate.quantity };
}

/**
 * Advances a paper session by exactly one chronological bar. Pure and
 * deterministic: same state plus same bar always yields the same next state.
 * The identical frontier bar is a no-op returning the same session;
 * anything older, divergent, or foreign is rejected deterministically.
 */
export function stepPaper(session: PaperSessionState, bar: Bar): PaperSessionResult {
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
  const stepperConfig: PaperStepperConfig = {
    quantity: session.config.quantity,
    slippageBps: session.config.slippageBps,
    brokeragePaise: session.config.brokeragePaise,
  };

  let open = session.open;
  let pending = session.pending;
  const rejected: BacktestRejectedEntry[] = [...session.rejectedEntries];
  const riskBlocks: PaperRiskBlock[] = [...(session.riskBlocks ?? [])];
  const ledger: PaperLedgerEntry[] = [...session.ledger];
  let entriesExecuted = session.diagnostics.entriesExecuted;

  const closeOpen = (exitRaw: number, reason: BacktestTrade["exitReason"]): PaperIssue | null => {
    const current = open;
    if (current === null) {
      return { field: "open", reason: "No open position to close." };
    }
    const entryBar = nextBars.find((candidate) => candidate.date === current.entryDate);
    if (entryBar === undefined) {
      return { field: "bars", reason: "Entry bar is missing from session history." };
    }
    const closed = buildStepperClose(
      current,
      entryBar.openPaise,
      date,
      exitRaw,
      reason,
      stepperConfig,
    );
    if (!isLedgerEntry(closed)) {
      return closed;
    }
    ledger.push(closed);
    open = null;
    return null;
  };

  if (pending !== null && pending.kind === "entry") {
    if (open !== null) {
      return fail("pending", "Stale entry intent cannot coexist with an open position.");
    }
    // M2-D gate: RiskGuard runs only here, after the next-bar raw open is
    // known. Sizing uses the raw open; slippage and the non-protective-stop
    // check below run afterwards on the approved quantity with no resize.
    const resolution = resolveEntryQuantity(
      session.config,
      session.cashPaise,
      bar.openPaise,
      pending.stopPaise,
    );
    if (resolution.kind === "gated-blocked") {
      riskBlocks.push(
        Object.freeze({
          date,
          code: resolution.code,
          reason: resolution.reason,
          entryPaise: bar.openPaise,
          stopPaise: pending.stopPaise,
        }),
      );
      pending = null;
    } else {
      const quantity = resolution.quantity;
      const buy = applySlippage(bar.openPaise, "buy", stepperConfig.slippageBps);
      if (pending.stopPaise >= buy.fillPricePaise) {
        rejected.push(
          Object.freeze({
            date,
            reason: "non-protective-stop",
            stopPaise: pending.stopPaise,
            entryFillPricePaise: buy.fillPricePaise,
          }),
        );
      } else {
        const buyTurnover = buy.fillPricePaise * quantity;
        if (!Number.isSafeInteger(buyTurnover)) {
          return fail("quantity", "Entry turnover exceeds safe integer range.");
        }
        const buyStatutory = calculateFillCosts(
          buyTurnover,
          "buy",
          stepperConfig.brokeragePaise,
        ).totalPaise;
        open = Object.freeze({
          symbol,
          side: "long",
          quantity,
          entryDate: date,
          entryFillPaise: buy.fillPricePaise,
          buyStatutoryPaise: buyStatutory,
          stopPaise: pending.stopPaise,
          targetPaise: pending.targetPaise,
          status: "open",
        }) as PaperOpenPosition;
        entriesExecuted += 1;
      }
      pending = null;
    }
  }

  let pendingExit = pending !== null && pending.kind === "exit";
  if (open !== null) {
    const hit = paperProtectiveExit(bar, open.stopPaise, open.targetPaise);
    if (hit !== null) {
      const failure = closeOpen(hit.raw, hit.type);
      if (failure !== null) {
        return { status: "invalid", errors: [failure] };
      }
      pendingExit = false;
    } else if (pendingExit) {
      const failure = closeOpen(bar.openPaise, "signal");
      if (failure !== null) {
        return { status: "invalid", errors: [failure] };
      }
      pendingExit = false;
    }
  } else {
    pendingExit = false;
  }

  const decision = session.config.evaluate({
    bars: nextBars,
    position:
      open === null
        ? { status: "flat" }
        : {
            status: "long",
            entryPricePaise: open.entryFillPaise,
            quantity: open.quantity,
            stopPaise: open.stopPaise,
            targetPaise: open.targetPaise,
          },
    params: session.config.params,
  });
  let signalsUnexecuted = 0;
  if (decision.kind === "entry" && open === null) {
    pending = Object.freeze({
      kind: "entry",
      stopPaise: decision.stopPaise,
      targetPaise: decision.targetPaise,
    }) as PaperPendingIntent;
    signalsUnexecuted = 1;
  } else if (decision.kind === "exit" && open !== null) {
    pending = Object.freeze({ kind: "exit" }) as PaperPendingIntent;
  } else {
    pending = null;
  }

  let realized = 0n;
  for (const entry of ledger) {
    realized += BigInt(entry.netPnlPaise);
  }
  const realizedPaise = toSafeNumber(realized);
  const cashPaise =
    realizedPaise === null
      ? null
      : toSafeNumber(BigInt(session.config.startingCashPaise) + BigInt(realizedPaise));
  if (realizedPaise === null || cashPaise === null) {
    return fail("ledger", "Paper accounting exceeds safe integer range.");
  }

  return {
    status: "ok",
    session: Object.freeze({
      config: session.config,
      symbol: session.symbol ?? symbol,
      bars: nextBars,
      lastProcessedDate: date,
      ledger: Object.freeze(ledger),
      realizedPnlPaise: realizedPaise,
      cashPaise,
      open,
      pending,
      diagnostics: Object.freeze({
        barsProcessed: nextBars.length,
        entriesExecuted,
        signalsUnexecutedAtEnd: signalsUnexecuted,
        rejectedEntries: rejected.length,
      }),
      rejectedEntries: Object.freeze(rejected),
      riskBlocks: Object.freeze(riskBlocks),
    }),
  };
}

function isLedgerEntry(value: PaperLedgerEntry | PaperIssue): value is PaperLedgerEntry {
  return typeof (value as PaperLedgerEntry).id === "string";
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
