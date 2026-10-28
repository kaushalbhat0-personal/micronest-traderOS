import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StrategyLabReportView } from "@/app/lab/report-view";
import type { StrategyLabReportOk } from "@/app/lab/report";
import manifestRaw from "@/features/strategy-lab/fixtures/sample-bars.manifest.json";
import type { BacktestTrade } from "@/features/strategy-lab/backtester";
import type { DatasetManifest } from "@/features/strategy-lab/types";
import type { LegMetrics, PartitionMetrics } from "@/features/strategy-lab/metrics";

/**
 * M1-F rendering tests — data integrity of the presentation layer only.
 *
 * The research literal below is a hand-written rendering fixture (small,
 * fixed numbers chosen to exercise every section). It is not produced by the
 * engine and proves nothing about the engine; it lets the tests assert that
 * the UI shows exactly the authoritative values it is given.
 */

function partition(over: Partial<PartitionMetrics> & { tradeCount: number }): PartitionMetrics {
  return {
    winCount: 0,
    lossCount: 0,
    flatCount: 0,
    netPnlPaise: 0,
    winRate: null,
    expectancy: null,
    profitFactor: null,
    profitFactorNote: "no-trades",
    maxDrawdownPaise: 0,
    costDrag: { statutoryPaise: 0, slippagePaise: 0, totalPaise: 0 },
    ...over,
  };
}

const OOS = partition({
  tradeCount: 1,
  winCount: 0,
  lossCount: 1,
  flatCount: 0,
  netPnlPaise: 400,
  winRate: { num: 0, den: 1, decimal: "0.000000" },
  expectancy: { num: 400, den: 1, decimal: "400.000000" },
  profitFactor: { num: 0, den: 300, decimal: "0.000000" },
  profitFactorNote: "ok",
  maxDrawdownPaise: 100,
  costDrag: { statutoryPaise: 2371, slippagePaise: 11, totalPaise: 2382 },
});

const IS = partition({
  tradeCount: 1,
  winCount: 1,
  lossCount: 0,
  flatCount: 0,
  netPnlPaise: 600,
  winRate: { num: 1, den: 1, decimal: "1.000000" },
  expectancy: { num: 600, den: 1, decimal: "600.000000" },
  profitFactor: null,
  profitFactorNote: "no-losing-trades",
  maxDrawdownPaise: 0,
  costDrag: { statutoryPaise: 2372, slippagePaise: 11, totalPaise: 2383 },
});

const ALL = partition({
  tradeCount: 2,
  winCount: 1,
  lossCount: 1,
  flatCount: 0,
  netPnlPaise: 1000,
  winRate: { num: 1, den: 2, decimal: "0.500000" },
  expectancy: { num: 1000, den: 2, decimal: "500.000000" },
  profitFactor: { num: 2000, den: 1000, decimal: "2.000000" },
  profitFactorNote: "ok",
  maxDrawdownPaise: 100,
  costDrag: { statutoryPaise: 4743, slippagePaise: 22, totalPaise: 4765 },
});

const EMPTY = partition({ tradeCount: 0 });

function trade(over: Partial<BacktestTrade> & { entryDate: string }): BacktestTrade {
  return {
    exitDate: over.entryDate,
    quantity: 1,
    entryRawPricePaise: 10000,
    exitRawPricePaise: 10400,
    entryFillPricePaise: 10005,
    exitFillPricePaise: 10395,
    entrySlippagePaise: 5,
    exitSlippagePaise: 6,
    buyStatutoryPaise: 2372,
    sellStatutoryPaise: 2371,
    grossPnlPaise: 390,
    netPnlPaise: 400,
    exitReason: "signal",
    forcedExitAtEnd: false,
    ...over,
  };
}

function propsWith(trades: readonly BacktestTrade[]): StrategyLabReportOk {
  const five: LegMetrics = { slippageBps: 5, all: ALL, is: IS, oos: OOS };
  const zero: LegMetrics = { slippageBps: 0, all: EMPTY, is: EMPTY, oos: EMPTY };
  const ten: LegMetrics = { slippageBps: 10, all: EMPTY, is: EMPTY, oos: EMPTY };
  return {
    status: "ok",
    manifest: manifestRaw as DatasetManifest,
    strategy: {
      id: "SLAB-STRAT-001",
      name: "SMA cross with N-bar-low stop",
      version: "1.0.0",
      params: { fastPeriod: 10, slowPeriod: 30, stopLookback: 20, minBars: 30 },
      quantity: 1,
      brokeragePaise: 2000,
    },
    research: {
      status: "ok",
      splitId: "SLAB-SPLIT-001",
      splitDate: "2026-09-14",
      referenceBps: 5,
      legs: [zero, five, ten],
      referenceOos: five.oos,
    },
    referenceTrades: trades,
  };
}

const TRADES = [
  trade({ entryDate: "2026-09-13", exitDate: "2026-09-14", exitReason: "signal" }),
  trade({
    entryDate: "2026-09-14",
    exitDate: "2026-09-16",
    exitReason: "forced-final",
    forcedExitAtEnd: true,
  }),
];

describe("strategy lab report rendering", () => {
  it("renders one h1 with the synthetic-data warning beside it", () => {
    render(<StrategyLabReportView report={propsWith(TRADES)} />);

    expect(screen.getByRole("heading", { level: 1, name: "Strategy Lab" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByText(
        /synthetic fixture dataset.*engineering validation of the research pipeline/i,
      ),
    ).toBeInTheDocument();
  });

  it("shows strategy metadata from the authoritative constants", () => {
    render(<StrategyLabReportView report={propsWith(TRADES)} />);

    expect(screen.getByText("SLAB-STRAT-001")).toBeInTheDocument();
    expect(screen.getByText("SMA cross with N-bar-low stop")).toBeInTheDocument();
    expect(screen.getByText("Research only")).toBeInTheDocument();
  });

  it("shows the frozen split date with exact IS/OOS entry-date definitions", () => {
    render(<StrategyLabReportView report={propsWith(TRADES)} />);

    expect(screen.getAllByText("2026-09-14").length).toBeGreaterThan(0);
    expect(screen.getAllByText("entryDate < 2026-09-14").length).toBeGreaterThan(0);
    expect(screen.getAllByText("entryDate >= 2026-09-14").length).toBeGreaterThan(0);
    expect(screen.getByText(/never split, duplicated, or prorated/i)).toBeInTheDocument();
  });

  it("marks only 5 bps as Reference while showing all three legs", () => {
    render(<StrategyLabReportView report={propsWith(TRADES)} />);

    expect(screen.getByText("0 bps")).toBeInTheDocument();
    expect(screen.getByText("5 bps")).toBeInTheDocument();
    expect(screen.getByText("10 bps")).toBeInTheDocument();
    expect(screen.getAllByText("Reference")).toHaveLength(1);
  });

  it("never labels a leg as best, optimal, or recommended", () => {
    render(<StrategyLabReportView report={propsWith(TRADES)} />);

    expect(screen.queryByText(/best/i)).toBeNull();
    expect(screen.queryByText(/optimal/i)).toBeNull();
    expect(screen.queryByText(/recommended/i)).toBeNull();
    expect(screen.queryByText(/winner/i)).toBeNull();
  });

  it("drives the OOS headline from the exact reference partition object", () => {
    const props = propsWith(TRADES);
    expect(props.research.referenceOos).toBe(props.research.legs[1]?.oos);
    render(<StrategyLabReportView report={props} />);

    // OOS net 400 paise → ₹4.00 in the headline, the partition table, and the leg card.
    expect(screen.getAllByText("₹4.00").length).toBeGreaterThanOrEqual(3);
    expect(
      screen.getAllByText("400.000000 paise per completed trade").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("compares All, IS, and OOS in an accessible table", () => {
    render(<StrategyLabReportView report={propsWith(TRADES)} />);

    const table = screen.getByRole("table", {
      name: /all, is, and oos metrics for the 5 bps reference leg/i,
    });
    expect(within(table).getByRole("rowheader", { name: "All" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "IS" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "OOS" })).toBeInTheDocument();
    // All net 1000 paise → ₹10.00; IS net 600 paise → ₹6.00.
    expect(within(table).getByText("₹10.00")).toBeInTheDocument();
    expect(within(table).getByText("₹6.00")).toBeInTheDocument();
  });

  it("shows frozen trade records verbatim without recalculation", () => {
    render(<StrategyLabReportView report={propsWith(TRADES)} />);

    const table = screen.getByRole("table", { name: /completed trades of the 5 bps/i });
    expect(within(table).getByText("2026-09-13")).toBeInTheDocument();
    expect(within(table).getByText("2026-09-16")).toBeInTheDocument();
    expect(within(table).getByText("forced-final")).toBeInTheDocument();
    expect(within(table).getByText("Yes")).toBeInTheDocument();
  });

  it("states the empty-trades case instead of estimating figures", () => {
    render(<StrategyLabReportView report={propsWith([])} />);

    expect(screen.getByText(/no completed trades in the reference leg/i)).toBeInTheDocument();
  });

  it("decomposes cost drag and names it a reporting decomposition", () => {
    render(<StrategyLabReportView report={propsWith(TRADES)} />);

    expect(screen.getAllByText("₹23.82").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/reporting decomposition only/i)).toBeInTheDocument();
  });

  it("lists every research limitation including split semantics", () => {
    render(<StrategyLabReportView report={propsWith(TRADES)} />);

    for (const item of [
      "No optimization and no parameter sweep.",
      "No live-market validation.",
      "No paper-trading validation.",
      "No broker execution validation.",
      "No claim of future profitability.",
    ]) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
    expect(screen.getByText(/not evidence of a real market regime change/i)).toBeInTheDocument();
  });

  it("does not mutate the research result while rendering", () => {
    const props = propsWith(TRADES);
    const before = JSON.stringify(props);
    render(<StrategyLabReportView report={props} />);
    expect(JSON.stringify(props)).toBe(before);
  });
});
