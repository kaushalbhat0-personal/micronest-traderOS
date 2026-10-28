"use client";

import { useState } from "react";

import { formatINR } from "@/app/lab/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import {
  createMarketStream,
  streamEmitNext,
  type MarketStreamState,
} from "@/features/strategy-lab/market-stream";
import { runPaperStreamToCompletion } from "@/features/strategy-lab/paper-run";
import {
  PAPER_BROKERAGE_PAISE,
  PAPER_QUANTITY,
  PAPER_RISK_BPS,
  PAPER_RISK_LOT_SIZE,
  PAPER_SLIPPAGE_BPS,
  PAPER_STARTING_CASH_PAISE,
  createPaperSession,
  type PaperSessionConfig,
} from "@/features/strategy-lab/paper";
import { evaluateSmaCross } from "@/features/strategy-lab/strategies/sma-cross";
import type { Bar } from "@/features/strategy-lab/types";
import { STRATEGY_LAB_REFERENCE_PARAMS } from "@/features/strategy-lab/types";
import type { StrategyDecision, StrategyEvaluate } from "@/features/strategy-lab/strategy";

/**
 * M3-1 manual paper operator — presentation and orchestration over the
 * frozen M3-0 market-stream simulator.
 *
 * One user action performs exactly one deterministic `streamEmitNext`
 * transition. All figures below are read verbatim from the authoritative
 * `stream.session`; nothing here calculates fills, costs, stops, size, or
 * P&L. No timers, no polling, no persistence, no network. State is
 * ephemeral: a refresh restarts the simulation.
 */

export type OperatorScenario = "reference" | "blocked-demo";

/** Demo-only signaling input: entry at the first close with a stop the gate must refuse. */
function demoBlockedEvaluate(context: { bars: readonly Bar[] }): StrategyDecision {
  if (context.bars.length === 1) {
    return {
      kind: "entry",
      direction: "long",
      stopPaise: 999_999_999,
      targetPaise: null,
      note: "demo block signal",
    };
  }
  return { kind: "no-signal" };
}

function operatorConfig(evaluate: StrategyEvaluate): PaperSessionConfig {
  return {
    startingCashPaise: PAPER_STARTING_CASH_PAISE,
    quantity: PAPER_QUANTITY,
    slippageBps: PAPER_SLIPPAGE_BPS,
    brokeragePaise: PAPER_BROKERAGE_PAISE,
    evaluate,
    params: STRATEGY_LAB_REFERENCE_PARAMS,
    riskBps: PAPER_RISK_BPS,
    lotSize: PAPER_RISK_LOT_SIZE,
  };
}

function initialStream(bars: readonly Bar[], scenario: OperatorScenario): MarketStreamState | null {
  const created = createPaperSession(
    operatorConfig(scenario === "reference" ? evaluateSmaCross : demoBlockedEvaluate),
  );
  if (created.status !== "ok") {
    return null;
  }
  return createMarketStream(bars, created.session);
}

function DefinitionList({ items }: { items: ReadonlyArray<{ term: string; value: string }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.term} className="min-w-0">
          <dt className="type-caption text-ink-muted">{item.term}</dt>
          <dd className="type-helper tnum mt-0.5 break-words text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OperatorView({
  bars,
  scenario = "reference",
}: {
  bars: readonly Bar[];
  scenario?: OperatorScenario;
}) {
  const [stream, setStream] = useState<MarketStreamState | null>(() =>
    initialStream(bars, scenario),
  );

  if (stream === null) {
    return (
      <Callout tone="danger" title="Simulation unavailable">
        The operator session could not be created from the frozen configuration.
      </Callout>
    );
  }

  const { session } = stream;
  const total = stream.dataset.length;
  const processed = session.bars.length;
  const exhausted = stream.cursor >= total;
  const halted = stream.halted;
  const lastBar = session.bars[session.bars.length - 1] as Bar | undefined;
  const lastDisposition = stream.log[stream.log.length - 1] ?? null;
  const lastRiskBlock = session.riskBlocks[session.riskBlocks.length - 1] ?? null;
  const lastRejected = session.rejectedEntries[session.rejectedEntries.length - 1] ?? null;

  const onNext = (): void => {
    setStream((previous) => {
      if (previous === null) {
        return previous;
      }
      return streamEmitNext(previous).stream;
    });
  };

  const onRunToEnd = (): void => {
    setStream((previous) => {
      if (previous === null) {
        return previous;
      }
      return runPaperStreamToCompletion(previous).stream;
    });
  };

  const onReset = (): void => {
    setStream(initialStream(bars, scenario));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">SIMULATION</Badge>
        <Badge tone="neutral">Synthetic demo data — not live prices</Badge>
      </div>

      <Callout tone="info" title="SIMULATION — FICTIONAL CASH">
        {`Starting fictional cash ${formatINR(session.config.startingCashPaise)}. No real money, no brokerage account, no live market connection.`}
      </Callout>

      <section aria-labelledby="slab-op-progress" className="space-y-4">
        <h2 id="slab-op-progress" className="type-section">
          Progress
        </h2>
        <Card as="article" className="min-w-0">
          <DefinitionList
            items={[
              { term: "Bars processed", value: `${String(processed)} / ${String(total)}` },
              { term: "Acknowledged events", value: String(stream.ack) },
              { term: "Log entries", value: String(stream.log.length) },
              {
                term: "Status",
                value: halted
                  ? "Halted"
                  : lastDisposition !== null && lastDisposition.kind === "rejected"
                    ? "Invalid event"
                    : exhausted
                      ? "End of dataset — complete"
                      : "Ready for next bar",
              },
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onNext} disabled={exhausted || halted} aria-label="Next bar">
              Next bar
            </Button>
            <Button
              variant="secondary"
              onClick={onRunToEnd}
              disabled={exhausted || halted}
              aria-label="Run to end"
            >
              Run to end
            </Button>
            <Button variant="secondary" onClick={onReset} aria-label="Reset simulation">
              Reset
            </Button>
          </div>
          <div aria-live="polite" className="type-helper mt-3 text-ink-muted">
            {lastDisposition === null
              ? "No events processed yet."
              : `Last event ${lastDisposition.date}: ${lastDisposition.kind}${lastDisposition.noop ? " (no-op)" : ""}.`}
          </div>
        </Card>
      </section>

      <section aria-labelledby="slab-op-bar" className="space-y-4">
        <h2 id="slab-op-bar" className="type-section">
          Current market bar
        </h2>
        <Card as="article" className="min-w-0">
          {lastBar === undefined ? (
            <p className="type-helper text-ink-muted">
              No bar processed yet. Select Next bar to consume the first synthetic bar.
            </p>
          ) : (
            <DefinitionList
              items={[
                { term: "Symbol", value: lastBar.symbol },
                { term: "Date", value: lastBar.date },
                { term: "Open", value: formatINR(lastBar.openPaise) },
                { term: "High", value: formatINR(lastBar.highPaise) },
                { term: "Low", value: formatINR(lastBar.lowPaise) },
                { term: "Close", value: formatINR(lastBar.closePaise) },
                { term: "Volume", value: lastBar.volume.toLocaleString("en-IN") },
              ]}
            />
          )}
        </Card>
      </section>

      <section aria-labelledby="slab-op-account" className="space-y-4">
        <h2 id="slab-op-account" className="type-section">
          Account — fictional cash
        </h2>
        <Card as="article" className="min-w-0">
          <DefinitionList
            items={[
              { term: "Starting cash", value: formatINR(session.config.startingCashPaise) },
              { term: "Current cash", value: formatINR(session.cashPaise) },
              { term: "Realized P&L", value: formatINR(session.realizedPnlPaise) },
              {
                term: "Open position",
                value:
                  session.open === null
                    ? "Flat"
                    : `Long ${String(session.open.quantity)} @ ${formatINR(session.open.entryFillPaise)} from ${session.open.entryDate}`,
              },
              {
                term: "Pending order",
                value:
                  session.pending === null
                    ? "None"
                    : session.pending.kind === "exit"
                      ? "Exit at next open"
                      : `Entry (stop ${formatINR(session.pending.stopPaise)})`,
              },
            ]}
          />
        </Card>
      </section>

      <section aria-labelledby="slab-op-execution" className="space-y-4">
        <h2 id="slab-op-execution" className="type-section">
          Execution state
        </h2>
        <Card as="article" className="min-w-0">
          <DefinitionList
            items={[
              {
                term: "Completed trades",
                value: String(session.ledger.length),
              },
              {
                term: "Latest RiskGuard block",
                value:
                  lastRiskBlock === null
                    ? "None"
                    : `${lastRiskBlock.code} on ${lastRiskBlock.date}: ${lastRiskBlock.reason}`,
              },
              {
                term: "Latest rejected entry",
                value:
                  lastRejected === null ? "None" : `${lastRejected.reason} on ${lastRejected.date}`,
              },
            ]}
          />
          {session.ledger.length === 0 ? null : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
              <table
                className="w-full min-w-160 border-collapse text-left"
                aria-label="Completed paper trades"
              >
                <caption className="sr-only">
                  Completed paper trades of this simulation, shown verbatim from the session.
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="type-caption border-b border-line px-4 py-3 font-medium whitespace-nowrap text-ink-muted"
                    >
                      Entry date
                    </th>
                    <th
                      scope="col"
                      className="type-caption border-b border-line px-4 py-3 font-medium whitespace-nowrap text-ink-muted"
                    >
                      Exit date
                    </th>
                    <th
                      scope="col"
                      className="type-caption border-b border-line px-4 py-3 font-medium whitespace-nowrap text-ink-muted"
                    >
                      Qty
                    </th>
                    <th
                      scope="col"
                      className="type-caption border-b border-line px-4 py-3 font-medium whitespace-nowrap text-ink-muted"
                    >
                      Net P&amp;L
                    </th>
                    <th
                      scope="col"
                      className="type-caption border-b border-line px-4 py-3 font-medium whitespace-nowrap text-ink-muted"
                    >
                      Exit reason
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {session.ledger.map((trade) => (
                    <tr key={trade.id}>
                      <td className="type-helper tnum border-b border-line px-4 py-3 whitespace-nowrap text-ink last:border-b-0">
                        {trade.entryDate}
                      </td>
                      <td className="type-helper tnum border-b border-line px-4 py-3 whitespace-nowrap text-ink last:border-b-0">
                        {trade.exitDate}
                      </td>
                      <td className="type-helper tnum border-b border-line px-4 py-3 whitespace-nowrap text-ink last:border-b-0">
                        {String(trade.quantity)}
                      </td>
                      <td className="type-helper tnum border-b border-line px-4 py-3 whitespace-nowrap text-ink last:border-b-0">
                        {formatINR(trade.netPnlPaise)}
                      </td>
                      <td className="type-helper tnum border-b border-line px-4 py-3 whitespace-nowrap text-ink last:border-b-0">
                        {trade.exitReason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
