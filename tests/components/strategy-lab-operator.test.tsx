import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OperatorView } from "@/app/lab/operator/operator-view";
import { formatINR } from "@/app/lab/format";
import { stepPaper, type PaperSessionState } from "@/features/strategy-lab/paper";
import {
  PAPER_BROKERAGE_PAISE,
  PAPER_QUANTITY,
  PAPER_RISK_BPS,
  PAPER_RISK_LOT_SIZE,
  PAPER_SLIPPAGE_BPS,
  PAPER_STARTING_CASH_PAISE,
  createPaperSession,
} from "@/features/strategy-lab/paper";
import { STRATEGY_LAB_REFERENCE_PARAMS, type Bar } from "@/features/strategy-lab/types";
import { evaluateSmaCross } from "@/features/strategy-lab/strategies/sma-cross";

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

const BARS = [
  bar("2026-09-01", 10000, 10100, 9900, 10000),
  bar("2026-09-02", 10000, 10100, 9900, 10000),
  bar("2026-09-03", 10000, 10100, 9900, 10000),
];

function nextBar(): HTMLElement {
  return screen.getByRole("button", { name: "Next bar" });
}

function resetButton(): HTMLElement {
  return screen.getByRole("button", { name: "Reset simulation" });
}

function directCashAfter(bars: readonly Bar[]): number {
  const created = createPaperSession({
    startingCashPaise: PAPER_STARTING_CASH_PAISE,
    quantity: PAPER_QUANTITY,
    slippageBps: PAPER_SLIPPAGE_BPS,
    brokeragePaise: PAPER_BROKERAGE_PAISE,
    evaluate: evaluateSmaCross,
    params: STRATEGY_LAB_REFERENCE_PARAMS,
    riskBps: PAPER_RISK_BPS,
    lotSize: PAPER_RISK_LOT_SIZE,
  });
  expect(created.status).toBe("ok");
  if (created.status !== "ok") {
    throw new Error("expected ok session");
  }
  let session: PaperSessionState = created.session;
  for (const next of bars) {
    const result = stepPaper(session, next);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error("expected ok step");
    }
    session = result.session;
  }
  return session.cashPaise;
}

describe("operator labeling and initial state", () => {
  it("renders simulation and fictional-cash labeling with correct initial progress", () => {
    render(<OperatorView bars={BARS} />);
    expect(screen.getByText("SIMULATION")).toBeInTheDocument();
    expect(screen.getByText("SIMULATION — FICTIONAL CASH")).toBeInTheDocument();
    expect(screen.getByText("Synthetic demo data — not live prices")).toBeInTheDocument();
    expect(screen.getByText("0 / 3")).toBeInTheDocument();
    expect(nextBar()).not.toBeDisabled();
  });
});

describe("manual stepping", () => {
  it("advances exactly one bar per action with the matching bar content", () => {
    render(<OperatorView bars={BARS} />);
    fireEvent.click(nextBar());
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByText("2026-09-01")).toBeInTheDocument();
    fireEvent.click(nextBar());
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByText("2026-09-02")).toBeInTheDocument();
  });

  it("derives account values from the authoritative session state", () => {
    render(<OperatorView bars={BARS} />);
    fireEvent.click(nextBar());
    fireEvent.click(nextBar());
    const expected = formatINR(directCashAfter(BARS.slice(0, 2)));
    // Starting and current cash agree (no trades on the short fixture): both
    // read verbatim from the authoritative session state.
    expect(screen.getAllByText(expected)).toHaveLength(2);
  });

  it("displays the RiskGuard block produced by the stream", () => {
    render(<OperatorView bars={BARS} scenario="blocked-demo" />);
    fireEvent.click(nextBar());
    expect(screen.getAllByText("None")).toHaveLength(2);
    fireEvent.click(nextBar());
    expect(screen.getByText(/invalid_stop on 2026-09-02/)).toBeInTheDocument();
  });

  it("disables Next bar at the end of the dataset", () => {
    render(<OperatorView bars={BARS} />);
    fireEvent.click(nextBar());
    fireEvent.click(nextBar());
    fireEvent.click(nextBar());
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(nextBar()).toBeDisabled();
  });

  it("reset creates a fresh deterministic session", () => {
    render(<OperatorView bars={BARS} />);
    fireEvent.click(nextBar());
    fireEvent.click(nextBar());
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    fireEvent.click(resetButton());
    expect(screen.getByText("0 / 3")).toBeInTheDocument();
    expect(screen.getByText("No events processed yet.")).toBeInTheDocument();
    expect(nextBar()).not.toBeDisabled();
  });
});

describe("operator purity", () => {
  const source = readFileSync(
    join(process.cwd(), "app", "lab", "operator", "operator-view.tsx"),
    "utf8",
  );

  it("introduces no persistence or network calls", () => {
    for (const token of [
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "document.cookie",
      "fetch(",
      "WebSocket",
      "supabase",
    ]) {
      expect(source, `forbidden token: ${token}`).not.toContain(token);
    }
  });

  it("introduces no timers or wall-clock scheduling", () => {
    for (const token of ["setTimeout", "setInterval", "requestAnimationFrame", "Date.now"]) {
      expect(source, `forbidden token: ${token}`).not.toContain(token);
    }
  });
});
