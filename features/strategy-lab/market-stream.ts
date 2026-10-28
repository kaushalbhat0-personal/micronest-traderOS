import { stepPaper, type PaperIssue, type PaperSessionState } from "@/features/strategy-lab/paper";
import type { Bar } from "@/features/strategy-lab/types";

/**
 * M3-0 ₹0 market-stream simulator — the single source of truth for
 * deterministic market-hours sequencing over the frozen M1/M2 stack.
 *
 * A sequencer and fault injector, not a trading engine. It holds an
 * already-validated `readonly Bar[]`, emits one event at a time in
 * cursor order (the logical clock), and delegates every event to the
 * frozen `stepPaper(state, bar)` transition — exactly once per emitted
 * event. All economics (fills, slippage, costs, stops, RiskGuard sizing,
 * cash) stay inside the frozen M1/M2 modules; this file computes none of
 * them and imports neither RiskGuard nor any cost pricer.
 *
 * No clock, no timers, no randomness, no network, no persistence, no
 * provider, no AI, no UI. Same (dataset, session, event sequence) always
 * yields the same stream. Recovery is re-derivation: replay the
 * acknowledged events from a fresh session.
 */

/** Operation recorded for one processed script step. */
export type MarketStreamDispositionKind = "emitted" | "skipped" | "halted" | "rejected";

/** Append-only, deterministic per-step record. No timestamps, no UUIDs. */
export interface MarketStreamDisposition {
  /** Logical position in the disposition log. Starts at 0. */
  seq: number;
  date: string;
  symbol: string;
  kind: MarketStreamDispositionKind;
  emitted: boolean;
  accepted: boolean;
  rejected: boolean;
  /** True when `stepPaper` returned the identical session (idempotent re-append). */
  noop: boolean;
}

/** Immutable simulator state. Never mutated; replaced by copies. */
export interface MarketStreamState {
  dataset: readonly Bar[];
  /** Next dataset index for normal emission. The logical clock. */
  cursor: number;
  /** Count of accepted events. The acknowledged frontier. */
  ack: number;
  session: PaperSessionState;
  log: readonly MarketStreamDisposition[];
  /** Last emitted event, for identical-duplicate simulation. */
  lastEvent: Bar | null;
  halted: boolean;
}

export type MarketStreamStepResult =
  | { status: "ok"; stream: MarketStreamState }
  | { status: "invalid"; errors: PaperIssue[]; stream: MarketStreamState };

/** Data-only fault script. Deterministic test data, never a connection manager. */
export type MarketStreamFaultStep =
  | { readonly op: "emit" }
  | { readonly op: "duplicate" }
  | { readonly op: "skip" }
  | { readonly op: "emitEvent"; readonly event: Bar }
  | { readonly op: "halt" }
  | { readonly op: "resume" };

/** Empty stream over an already-validated dataset and a fresh paper session. */
export function createMarketStream(
  dataset: readonly Bar[],
  session: PaperSessionState,
): MarketStreamState {
  return Object.freeze({
    dataset: Object.freeze([...dataset]),
    cursor: 0,
    ack: 0,
    session,
    log: Object.freeze([]),
    lastEvent: null,
    halted: false,
  });
}

function appendDisposition(
  stream: MarketStreamState,
  entry: Omit<MarketStreamDisposition, "seq">,
): readonly MarketStreamDisposition[] {
  return Object.freeze([...stream.log, Object.freeze({ ...entry, seq: stream.log.length })]);
}

function withSession(
  stream: MarketStreamState,
  session: PaperSessionState,
  updates: Partial<Pick<MarketStreamState, "cursor" | "ack" | "lastEvent" | "halted">>,
  disposition: Omit<MarketStreamDisposition, "seq">,
): MarketStreamState {
  return Object.freeze({
    ...stream,
    ...updates,
    session,
    log: appendDisposition(stream, disposition),
  });
}

function describe(event: Bar): Pick<MarketStreamDisposition, "date" | "symbol"> {
  return {
    date: typeof event?.date === "string" ? event.date : "invalid",
    symbol: typeof event?.symbol === "string" ? event.symbol : "invalid",
  };
}

/**
 * Processes one explicit market event through the frozen `stepPaper`
 * transition. Invalid events leave session, cursor, and ack unchanged and
 * are recorded as rejected dispositions.
 */
export function streamEmitEvent(stream: MarketStreamState, event: Bar): MarketStreamStepResult {
  if (stream.halted) {
    return {
      status: "ok",
      stream: withSession(
        stream,
        stream.session,
        {},
        {
          ...describe(event),
          kind: "halted",
          emitted: false,
          accepted: false,
          rejected: false,
          noop: false,
        },
      ),
    };
  }
  const result = stepPaper(stream.session, event);
  if (result.status === "invalid") {
    return {
      status: "invalid",
      errors: result.errors,
      stream: withSession(
        stream,
        stream.session,
        {},
        {
          ...describe(event),
          kind: "rejected",
          emitted: true,
          accepted: false,
          rejected: true,
          noop: false,
        },
      ),
    };
  }
  const noop = result.session === stream.session;
  return {
    status: "ok",
    stream: withSession(
      stream,
      result.session,
      { ack: stream.ack + 1, lastEvent: event },
      { ...describe(event), kind: "emitted", emitted: true, accepted: true, rejected: false, noop },
    ),
  };
}

/** Emits `dataset[cursor]` in order. End of dataset is a clean no-op. */
export function streamEmitNext(stream: MarketStreamState): MarketStreamStepResult {
  const next = stream.dataset[stream.cursor] as Bar | undefined;
  if (next === undefined) {
    return { status: "ok", stream };
  }
  const stepped = streamEmitEvent(stream, next);
  if (stepped.status === "invalid") {
    return stepped;
  }
  if (stream.halted) {
    return stepped;
  }
  return {
    status: "ok",
    stream: Object.freeze({ ...stepped.stream, cursor: stream.cursor + 1 }),
  };
}

/** Re-emits the last emitted event byte-identically (idempotency probe). */
export function streamDuplicate(stream: MarketStreamState): MarketStreamStepResult {
  if (stream.lastEvent === null) {
    return {
      status: "invalid",
      errors: [{ field: "fault", reason: "No previously emitted event to duplicate." }],
      stream,
    };
  }
  return streamEmitEvent(stream, stream.lastEvent);
}

/** Advances the cursor without emitting. Gaps are never synthesized. */
export function streamSkip(stream: MarketStreamState): MarketStreamState {
  const skipped = stream.dataset[stream.cursor] as Bar | undefined;
  if (skipped === undefined) {
    return stream;
  }
  return withSession(
    stream,
    stream.session,
    { cursor: stream.cursor + 1 },
    {
      ...describe(skipped),
      kind: "skipped",
      emitted: false,
      accepted: false,
      rejected: false,
      noop: false,
    },
  );
}

/** Stops emission without mutating paper state. */
export function streamHalt(stream: MarketStreamState): MarketStreamState {
  return Object.freeze({ ...stream, halted: true });
}

/** Resumes emission from the last acknowledged frontier. */
export function streamResume(stream: MarketStreamState): MarketStreamState {
  return Object.freeze({ ...stream, halted: false });
}

/**
 * Folds a declarative fault script over the stream. Stops at the first
 * invalid step and returns the stream-so-far with the rejection logged.
 */
export function runMarketStreamFaults(
  stream: MarketStreamState,
  steps: readonly MarketStreamFaultStep[],
): MarketStreamStepResult {
  let current = stream;
  for (const step of steps) {
    if (step.op === "halt") {
      current = streamHalt(current);
      continue;
    }
    if (step.op === "resume") {
      current = streamResume(current);
      continue;
    }
    if (step.op === "skip") {
      current = streamSkip(current);
      continue;
    }
    const stepped =
      step.op === "emit"
        ? streamEmitNext(current)
        : step.op === "duplicate"
          ? streamDuplicate(current)
          : streamEmitEvent(current, step.event);
    if (stepped.status === "invalid") {
      return stepped;
    }
    current = stepped.stream;
  }
  return { status: "ok", stream: current };
}

/** Emits the whole dataset cursor-to-end with no faults. */
export function runMarketStream(stream: MarketStreamState): MarketStreamStepResult {
  let current = stream;
  while (current.cursor < current.dataset.length) {
    const stepped = streamEmitNext(current);
    if (stepped.status === "invalid") {
      return stepped;
    }
    current = stepped.stream;
  }
  return { status: "ok", stream: current };
}

/**
 * Deterministic recovery: folds the acknowledged event sequence through
 * `stepPaper` from a fresh session. No persistence, no files, no storage —
 * re-derivation only. Returns the reconstructed session, or the first
 * invalid outcome.
 */
export function recoverMarketStream(
  initialSession: PaperSessionState,
  acceptedEvents: readonly Bar[],
): { status: "ok"; session: PaperSessionState } | { status: "invalid"; errors: PaperIssue[] } {
  let session = initialSession;
  for (const event of acceptedEvents) {
    const result = stepPaper(session, event);
    if (result.status === "invalid") {
      return { status: "invalid", errors: result.errors };
    }
    session = result.session;
  }
  return { status: "ok", session };
}

/**
 * Events the stream accepted, in order — the recovery input. The frozen
 * engine appends only validated frontier bars to `session.bars`, so the
 * session history is exactly the accepted event sequence: rejected,
 * skipped, and halted events never appear here.
 */
export function acceptedEvents(stream: MarketStreamState): readonly Bar[] {
  return Object.freeze([...stream.session.bars]);
}
