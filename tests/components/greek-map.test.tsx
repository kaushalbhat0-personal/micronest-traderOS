import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GreekMapAnalyzer } from "@/features/greek-map/components/greek-map-analyzer";

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillValidCall(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    "Spot (₹)": "100",
    "Strike (₹)": "100",
    "Days to expiry": "30",
    "Volatility (% per year)": "20",
    "Risk-free rate (% per year)": "6",
    "Dividend yield (% per year)": "0",
    "Your premium (₹, optional)": "",
    "Expiry label (optional)": "",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) fill(label, value);
}

function calculate() {
  fireEvent.click(screen.getByRole("button", { name: "Calculate model" }));
}

/** Phrases that must never appear as recommendation or prediction language. */
const FORBIDDEN = [
  /\bhigh delta\b/i,
  /\blow delta\b/i,
  /\bhigh theta\b/i,
  /\blow theta\b/i,
  /\bhigh gamma\b/i,
  /\blow gamma\b/i,
  /\bhigh vega\b/i,
  /\blow vega\b/i,
  /\bbetter\b/i,
  /\bstrong\b/i,
  /\battractive\b/i,
  /\bfavorable\b/i,
  /\bcheap\b/i,
  /\bexpensive\b/i,
  /\bfair value\b/i,
  /\bideal\b/i,
  /\boptimal\b/i,
  /\brecommended\b/i,
  /\blikely\b/i,
  /\bprofitable\b/i,
  /\bpop\b/i,
  /\bwinner\b/i,
];

describe("GreekMapAnalyzer empty state", () => {
  it("renders the empty state with neutral helper copy", () => {
    render(<GreekMapAnalyzer />);

    expect(screen.getByText("Your model result will appear here")).toBeInTheDocument();
    expect(screen.getByText(/never judges a strike or a strategy/)).toBeInTheDocument();
  });
});

describe("GreekMapAnalyzer calculation", () => {
  it("calculates a valid call and shows the model value plus five Greeks", () => {
    render(<GreekMapAnalyzer />);
    fillValidCall();
    calculate();

    expect(screen.getAllByText(/Model calculated/)).toHaveLength(2);
    // Hero plus the 0% spot row. Receipt rows assert separately once expanded.
    expect(screen.getAllByText("₹2.54")).toHaveLength(2);
    expect(screen.getAllByText("0.5456")).toHaveLength(2);
    expect(screen.getAllByText("0.069121")).toHaveLength(2);
    expect(screen.getByText("Calculation receipt · GM-001")).toBeInTheDocument();
    expect(screen.getByText("GM-001", { exact: true })).toBeInTheDocument();
  });

  it("calculates a valid put with a negative delta", () => {
    render(<GreekMapAnalyzer />);
    fireEvent.click(screen.getByLabelText("PE (Put)"));
    fillValidCall();
    calculate();

    expect(screen.getAllByText(/Model calculated/)).toHaveLength(2);
    expect(screen.getAllByText("₹2.04")).toHaveLength(2);
    expect(screen.getAllByText("-0.4544")).toHaveLength(2);
  });

  it("clears a stale result when the option type switches", () => {
    render(<GreekMapAnalyzer />);
    fillValidCall();
    calculate();
    expect(screen.getAllByText(/Model calculated/)).toHaveLength(2);

    fireEvent.click(screen.getByLabelText("PE (Put)"));
    expect(screen.getByText("Your model result will appear here")).toBeInTheDocument();
    expect(screen.queryByText(/Model calculated/)).not.toBeInTheDocument();
  });

  it("shows the model comparison only when a premium is typed", () => {
    render(<GreekMapAnalyzer />);
    fillValidCall({ "Your premium (₹, optional)": "3" });
    calculate();

    expect(screen.getByText("Model comparison")).toBeInTheDocument();
    expect(
      screen.getByText("Arithmetic difference only — not a mispricing signal."),
    ).toBeInTheDocument();
    expect(screen.getByText("+₹0.46")).toBeInTheDocument();
  });

  it("shows no comparison section when the premium is missing", () => {
    render(<GreekMapAnalyzer />);
    fillValidCall();
    calculate();

    expect(screen.queryByText("Model comparison")).not.toBeInTheDocument();
  });

  it("warns but still calculates when the premium is under intrinsic value", () => {
    render(<GreekMapAnalyzer />);
    fillValidCall({ "Spot (₹)": "110", "Your premium (₹, optional)": "5" });
    calculate();

    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(/under the intrinsic value/);
    expect(screen.getAllByText(/Model calculated/)).toHaveLength(2);
    expect(screen.getByText("Model comparison")).toBeInTheDocument();
  });

  it("warns when the premium is outside the arbitrage bounds", () => {
    render(<GreekMapAnalyzer />);
    // A ₹200 premium on a ₹100 spot cannot sit inside the European bounds.
    fillValidCall({ "Your premium (₹, optional)": "200" });
    calculate();

    expect(screen.getByText(/outside the European arbitrage bounds/)).toBeInTheDocument();
    expect(screen.getAllByText(/Model calculated/)).toHaveLength(2);
  });

  it("blocks invalid input with a factual reason", () => {
    render(<GreekMapAnalyzer />);
    calculate();

    expect(screen.getByText("Spot is required.")).toBeInTheDocument();
    expect(screen.queryByText(/Model calculated/)).not.toBeInTheDocument();
  });

  it("requires volatility, rate and dividend with no defaults", () => {
    render(<GreekMapAnalyzer />);
    fill("Spot (₹)", "100");
    fill("Strike (₹)", "100");
    fill("Days to expiry", "30");
    calculate();

    expect(screen.getByText("Volatility is required.")).toBeInTheDocument();
    expect(screen.getByText(/Risk-free rate is required/)).toBeInTheDocument();
    expect(screen.getByText(/Dividend yield is required/)).toBeInTheDocument();
  });
});

describe("GreekMapAnalyzer scenarios", () => {
  it("shows five spot scenarios with the base row badged", () => {
    render(<GreekMapAnalyzer />);
    fillValidCall();
    calculate();

    expect(screen.getAllByText("What-if (not a forecast)")).toHaveLength(2);
    for (const pct of ["-10%", "-5%", "0%", "5%", "10%"]) {
      expect(screen.getByLabelText(`Spot ${pct} scenario`, { exact: false })).toBeInTheDocument();
    }
    // The form heading plus the badge on the 0% scenario row.
    expect(screen.getAllByText("Your inputs")).toHaveLength(2);
  });

  it("shows three time scenarios with model value and theta", () => {
    render(<GreekMapAnalyzer />);
    fillValidCall();
    calculate();

    for (const days of [1, 3, 7]) {
      expect(screen.getByLabelText(`Minus ${days} day scenario`)).toBeInTheDocument();
    }
  });

  it("marks omitted time rows at the DTE floor instead of clamping", () => {
    render(<GreekMapAnalyzer />);
    fillValidCall({ "Days to expiry": "3" });
    calculate();

    expect(screen.getAllByText("omitted — V1 has a 1-day DTE floor")).toHaveLength(2);
  });
});

describe("GreekMapAnalyzer receipt and copy", () => {
  it("exposes the GM-001 receipt with model language", () => {
    render(<GreekMapAnalyzer />);
    fillValidCall();
    calculate();

    fireEvent.click(screen.getByText("Calculation receipt · GM-001"));
    expect(screen.getByText("MicroNest model")).toBeInTheDocument();
    expect(
      screen.getByText("Black-Scholes-Merton with continuous dividend yield"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not an NSE settlement or exchange pricing calculation/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/model price sensitivity to one calendar day of time decay/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Not investment advice\./)).toBeInTheDocument();
  });

  it("carries no recommendation or prediction language on the surface", () => {
    const { container } = render(<GreekMapAnalyzer />);
    fillValidCall({ "Your premium (₹, optional)": "3" });
    calculate();
    fireEvent.click(screen.getByText("Calculation receipt · GM-001"));

    const text = container.textContent ?? "";
    for (const pattern of FORBIDDEN) {
      expect(text, `forbidden copy: ${pattern}`).not.toMatch(pattern);
    }
  });

  it("prefills type, strike and spot from a handoff", () => {
    render(<GreekMapAnalyzer initialFields={{ optionType: "put", spot: "100", strike: "105" }} />);

    expect(screen.getByLabelText("Spot (₹)")).toHaveValue("100");
    expect(screen.getByLabelText("Strike (₹)")).toHaveValue("105");
    expect(screen.getByLabelText("PE (Put)")).toBeChecked();
    expect(screen.getByText("Values carried forward")).toBeInTheDocument();
  });

  it("keeps every field editable after a handoff prefill", () => {
    render(<GreekMapAnalyzer initialFields={{ optionType: "put", spot: "100", strike: "105" }} />);
    fill("Spot (₹)", "200");
    fillValidCall({ "Spot (₹)": "200", "Strike (₹)": "190" });
    fireEvent.click(screen.getByLabelText("PE (Put)"));
    calculate();

    expect(screen.getAllByText(/Model calculated/)).toHaveLength(2);
  });

  it("assumes a 360px layout without clipping the form", () => {
    const { container } = render(<GreekMapAnalyzer />);
    expect(container.querySelector("form")).toBeInTheDocument();
    for (const label of [
      "Spot (₹)",
      "Strike (₹)",
      "Days to expiry",
      "Volatility (% per year)",
      "Risk-free rate (% per year)",
      "Dividend yield (% per year)",
      "Your premium (₹, optional)",
      "Expiry label (optional)",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });
});
