import {
  runMarketStream,
  streamEmitEvent,
  streamEmitNext,
  type MarketStreamState,
  type MarketStreamStepResult,
} from "@/features/strategy-lab/market-stream";
import type { Bar } from "@/features/strategy-lab/types";

/** Issue shape surfaced by the existing stream transition. Read-only here. */
type PaperRunIssue = Extract<MarketStreamStepResult, { status: "invalid" }>["errors"][number];

/**
 * M3-2 deterministic unattended paper runner — the derived run-to-completion
 * layer over the frozen M3-0 market-stream simulator.
 *
 * A pure fold and a read-only summary only. It owns no sequencing of its own
 * (every event flows through the existing stream transition), no paper
 * execution (transitively through the frozen paper transition), no fill,
 * slippage, sizing, gate, stop, or P&L arithmetic. No clock, no timers, no
 * network, no persistence, no broker, no AI. Same input stream always yields
 * the same terminal stream.
 */

/** Terminal run outcome. `complete` means cursor reached dataset end. */
export type PaperRunStatus = "complete" | "halted" | "invalid";

/** Read-only derived summary of a terminal stream. Nothing here is stored. */
export interface PaperRunSummary {
  status: PaperRunStatus;
  cursor: number;
  datasetLength: number;
  acknowledgedEvents: number;
  logEntries: number;
  lastProcessedDate: string | null;
  symbol: string | null;
  open: MarketStreamState["session"]["open"];
  pending: MarketStreamState["session"]["pending"];
  cashPaise: number;
  realizedPnlPaise: number;
  ledger: MarketStreamState["session"]["ledger"];
  riskBlocks: MarketStreamState["session"]["riskBlocks"];
  rejectedEntries: MarketStreamState["session"]["rejectedEntries"];
  diagnostics: MarketStreamState["session"]["diagnostics"];
  errors: readonly PaperRunIssue[];
}

export type PaperRunResult =
  | { status: "complete"; stream: MarketStreamState }
  | { status: "halted"; stream: MarketStreamState }
  | { status: "invalid"; errors: PaperRunIssue[]; stream: MarketStreamState };

/**
 * Runs an unattended deterministic pass over the stream until dataset
 * completion, halt, or the first invalid event. Pure: the input stream is
 * never mutated; the terminal stream is returned by value.
 */
export function runPaperStreamToCompletion(stream: MarketStreamState): PaperRunResult {
  if (stream.halted) {
    return { status: "halted", stream };
  }
  const result: MarketStreamStepResult = runMarketStream(stream);
  if (result.status === "invalid") {
    return { status: "invalid", errors: result.errors, stream: result.stream };
  }
  if (result.stream.halted) {
    return { status: "halted", stream: result.stream };
  }
  return { status: "complete", stream: result.stream };
}

/**
 * Advances one frontier bar through the existing stream transition.
 * Pass-through of existing stream semantics for explicit per-bar driving;
 * the completion runner itself never needs it.
 */
export function runPaperNext(stream: MarketStreamState): MarketStreamStepResult {
  return streamEmitNext(stream);
}

/** Processes one explicit event through the existing stream transition. */
export function runPaperEvent(stream: MarketStreamState, event: Bar): MarketStreamStepResult {
  return streamEmitEvent(stream, event);
}

/**
 * Derives a read-only summary from a terminal run result. Reads
 * authoritative session values only — no recalculation of any kind.
 */
export function paperRunSummary(result: PaperRunResult): PaperRunSummary {
  const { stream } = result;
  return Object.freeze({
    status: result.status,
    cursor: stream.cursor,
    datasetLength: stream.dataset.length,
    acknowledgedEvents: stream.ack,
    logEntries: stream.log.length,
    lastProcessedDate: stream.session.lastProcessedDate,
    symbol: stream.session.symbol,
    open: stream.session.open,
    pending: stream.session.pending,
    cashPaise: stream.session.cashPaise,
    realizedPnlPaise: stream.session.realizedPnlPaise,
    ledger: stream.session.ledger,
    riskBlocks: stream.session.riskBlocks,
    rejectedEntries: stream.session.rejectedEntries,
    diagnostics: stream.session.diagnostics,
    errors:
      result.status === "invalid"
        ? Object.freeze([...result.errors])
        : Object.freeze([] as PaperRunIssue[]),
  });
}
