import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RiskGuardCalculator } from "@/features/risk-guard/components/risk-guard-calculator";

function fillSizing() {
  fireEvent.change(screen.getByLabelText("Capital (₹)"), { target: { value: "100000" } });
  fireEvent.change(screen.getByLabelText("Risk %"), { target: { value: "2.5" } });
  fireEvent.change(screen.getByLabelText("Lot size"), { target: { value: "1" } });
}

const HANDOFF = { direction: "long", entry: "100", stop: "95", target: "110" } as const;

describe("RiskGuardCalculator decision comparison", () => {
  it("shows plan-origin values alongside the authoritative sizing result", () => {
    render(<RiskGuardCalculator initialFields={{ ...HANDOFF }} />);
    fillSizing();
    fireEvent.click(screen.getByRole("button", { name: "Calculate position size" }));

    expect(screen.getByRole("heading", { name: "Decision comparison" })).toBeInTheDocument();
    const comparison = screen
      .getByRole("heading", { name: "Decision comparison" })
      .closest("div");
    expect(comparison).toHaveTextContent("₹100.00");
    expect(comparison).toHaveTextContent("₹2,500.00");
    expect(comparison).toHaveTextContent("Plan values as carried in");
  });

  it("keeps plan-origin values frozen when a carried value is edited", () => {
    render(<RiskGuardCalculator initialFields={{ ...HANDOFF }} />);
    fillSizing();
    fireEvent.change(screen.getByLabelText("Entry (₹)"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Target (₹)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate position size" }));

    // Entry 200 against stop 95: per-unit risk 105, budget 2500 → 23 units.
    const comparison = screen
      .getByRole("heading", { name: "Decision comparison" })
      .closest("div");
    expect(comparison).toHaveTextContent("Plan entry");
    expect(comparison).toHaveTextContent("₹100.00");
    expect(comparison).toHaveTextContent("₹2,415.00");
  });

  it("shows the plan but no success numbers when sizing is blocked", () => {
    render(<RiskGuardCalculator initialFields={{ direction: "long", entry: "100", stop: "95" }} />);
    fireEvent.change(screen.getByLabelText("Capital (₹)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Risk %"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Lot size"), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate position size" }));

    expect(screen.getByText("Trade blocked")).toBeInTheDocument();
    const comparison = screen
      .getByRole("heading", { name: "Decision comparison" })
      .closest("div");
    expect(comparison).toHaveTextContent("₹100.00");
    expect(comparison).toHaveTextContent("No position authorized");
    expect(comparison).not.toHaveTextContent("Used risk");
  });

  it("renders no comparison without a handoff", () => {
    render(<RiskGuardCalculator />);
    fillSizing();
    fireEvent.change(screen.getByLabelText("Entry (₹)"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Stop-loss (₹)"), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate position size" }));

    expect(screen.getByText("Within your risk budget")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Decision comparison" }),
    ).not.toBeInTheDocument();
  });
});
