import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TradeCostCalculator } from "@/features/trade-cost/components/trade-cost-calculator";

function fillEstimate() {
  fireEvent.change(screen.getByLabelText("Buy price (₹)"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Sell price (₹)"), { target: { value: "110" } });
  fireEvent.change(screen.getByLabelText("Quantity (shares)"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Brokerage total (₹)"), { target: { value: "40" } });
}

function estimate() {
  fireEvent.click(screen.getByRole("button", { name: "Estimate transaction costs" }));
}

describe("TradeCostCalculator estimate", () => {
  it("shows net P&L, all seven charge lines and the TC-001 receipt", () => {
    render(<TradeCostCalculator />);
    fillEstimate();
    estimate();

    expect(screen.getByText("Survives costs")).toBeInTheDocument();
    // Net P&L appears once as the metric and once in the charges list.
    expect(screen.getAllByText("₹929.51")).toHaveLength(2);
    for (const term of [
      "Gross P&L",
      "Brokerage (your assumption)",
      "STT",
      "NSE transaction",
      "NSE IPFT",
      "Stamp duty",
      "SEBI fee",
      "GST",
      "Total charges",
    ]) {
      expect(screen.getByText(term, { exact: true })).toBeInTheDocument();
    }
    // "Net P&L" appears as the result heading and as a charges-list row.
    expect(screen.getAllByText("Net P&L", { exact: true })).toHaveLength(2);
    expect(screen.getByText("Calculation receipt · TC-001")).toBeInTheDocument();
    expect(screen.getByText("nse-cash-2026-03-01")).toBeInTheDocument();
    expect(screen.getByText("2026-03-01")).toBeInTheDocument();
  });

  it("shows breakeven with a residual", () => {
    render(<TradeCostCalculator />);
    fillEstimate();
    estimate();

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          (element.textContent ?? "").includes("Breakeven sell price"),
      ),
    ).toBeInTheDocument();
  });

  it("reports short delivery as unsupported without throwing", () => {
    render(<TradeCostCalculator />);
    fireEvent.click(screen.getByLabelText("Short"));
    fillEstimate();
    estimate();

    expect(screen.getByText("Not supported")).toBeInTheDocument();
    expect(screen.getByText("short_delivery_unsupported")).toBeInTheDocument();
  });

  it("requires explicit brokerage instead of defaulting blank to zero", () => {
    render(<TradeCostCalculator />);
    fireEvent.change(screen.getByLabelText("Buy price (₹)"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Sell price (₹)"), { target: { value: "110" } });
    fireEvent.change(screen.getByLabelText("Quantity (shares)"), { target: { value: "100" } });
    estimate();

    expect(screen.getByText("Brokerage is required. Enter 0 when no brokerage is assumed.")).toBeInTheDocument();
    expect(screen.queryByText("Survives costs")).not.toBeInTheDocument();
  });
});

describe("TradeCostCalculator handoff", () => {
  const HANDOFF = { direction: "long", entry: "100", target: "110", quantity: "100" } as const;

  it("prefills from a RiskGuard sizing and shows frozen origin values", () => {
    render(<TradeCostCalculator initialFields={{ ...HANDOFF }} />);
    expect(screen.getByText("From your RiskGuard sizing")).toBeInTheDocument();
    expect((screen.getByLabelText("Buy price (₹)") as HTMLInputElement).value).toBe("100");
    expect((screen.getByLabelText("Sell price (₹)") as HTMLInputElement).value).toBe("110");
    expect((screen.getByLabelText("Quantity (shares)") as HTMLInputElement).value).toBe("100");

    fireEvent.change(screen.getByLabelText("Brokerage total (₹)"), { target: { value: "40" } });
    estimate();

    const origin = screen.getByText("Sized entry").closest("dl");
    expect(origin).toHaveTextContent("₹100.00");
    expect(origin).toHaveTextContent("Sized target");
    expect(origin).toHaveTextContent("₹110.00");
    expect(screen.getAllByText("₹929.51")).toHaveLength(2);
  });

  it("keeps origin values frozen when a carried value is edited", () => {
    render(<TradeCostCalculator initialFields={{ ...HANDOFF }} />);
    fireEvent.change(screen.getByLabelText("Sell price (₹)"), { target: { value: "100.5" } });
    fireEvent.change(screen.getByLabelText("Brokerage total (₹)"), { target: { value: "40" } });
    estimate();

    const origin = screen.getByText("Sized entry").closest("dl");
    expect(origin).toHaveTextContent("₹100.00");
    expect(origin).toHaveTextContent("₹110.00");
    // Edited exit 100.50: gross ₹50 cannot cover ~₹70 in charges + ₹40 brokerage.
    expect(screen.getByText("Eaten by costs")).toBeInTheDocument();
  });

  it("leaves the exit blank when no target was carried", () => {
    render(
      <TradeCostCalculator initialFields={{ direction: "long", entry: "100", quantity: "100" }} />,
    );
    expect((screen.getByLabelText("Sell price (₹)") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Sell price (₹)"), { target: { value: "110" } });
    fireEvent.change(screen.getByLabelText("Brokerage total (₹)"), { target: { value: "40" } });
    estimate();
    expect(screen.getByText("No target carried")).toBeInTheDocument();
  });

  it("renders no origin panel without a handoff", () => {
    render(<TradeCostCalculator />);
    fillEstimate();
    estimate();

    expect(screen.queryByText("From your RiskGuard sizing")).not.toBeInTheDocument();
    expect(screen.getAllByText("₹929.51")).toHaveLength(2);
  });
});
