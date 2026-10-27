import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StrikeLensComparison } from "@/features/strike-lens/components/strike-lens-comparison";

function field(label: "Strike (₹)" | "Premium (₹)", index: number): HTMLElement {
  const element = screen.getAllByLabelText(label)[index];
  if (element === undefined) throw new Error(`missing ${label} at row ${index}`);
  return element;
}

function fillRow(index: number, strike: string, premium: string) {
  fireEvent.change(field("Strike (₹)", index), {
    target: { value: strike },
  });
  fireEvent.change(field("Premium (₹)", index), {
    target: { value: premium },
  });
}

function compare() {
  fireEvent.click(screen.getByRole("button", { name: "Compare strikes" }));
}

function fillSpot(value: string) {
  fireEvent.change(screen.getByLabelText("Spot (₹)"), { target: { value } });
}

describe("StrikeLensComparison empty state", () => {
  it("renders one strike row with helper copy", () => {
    render(<StrikeLensComparison />);

    expect(screen.getByText("Your comparison will appear here")).toBeInTheDocument();
    expect(
      screen.getByText(/Add up to 5 strikes of the same type to compare\./),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText("Strike (₹)")).toHaveLength(1);
  });
});

describe("StrikeLensComparison comparison", () => {
  it("compares one CE strike and shows the SL-001 receipt", () => {
    render(<StrikeLensComparison />);
    fillSpot("100");
    fillRow(0, "95", "8");
    compare();

    expect(screen.getByText("Compared 1 strike")).toBeInTheDocument();
    expect(screen.getByText("ITM")).toBeInTheDocument();
    expect(screen.getByText("₹5.00")).toBeInTheDocument();
    expect(screen.getByText("₹3.00")).toBeInTheDocument();
    expect(screen.getByText("₹103.00")).toBeInTheDocument();
    expect(screen.getByText("Calculation receipt · SL-001")).toBeInTheDocument();
    expect(screen.getByText("SL-001", { exact: true })).toBeInTheDocument();
  });

  it("marks the nearest strike without calling it ATM", () => {
    render(<StrikeLensComparison />);
    fillSpot("100");
    fillRow(0, "95", "8");
    fireEvent.click(screen.getByRole("button", { name: "Add strike" }));
    fillRow(1, "102", "4");
    compare();

    expect(screen.getByText("Compared 2 strikes")).toBeInTheDocument();
    expect(screen.getByText("Nearest to spot")).toBeInTheDocument();
    expect(screen.queryByText("ATM")).not.toBeInTheDocument();
  });

  it("compares five strikes", () => {
    render(<StrikeLensComparison />);
    fillSpot("100");
    const strikes: Array<[string, string]> = [
      ["90", "12"],
      ["95", "8"],
      ["100", "5"],
      ["105", "3"],
      ["110", "2"],
    ];
    strikes.forEach(([strike, premium], index) => {
      if (index > 0) fireEvent.click(screen.getByRole("button", { name: "Add strike" }));
      fillRow(index, strike, premium);
    });
    compare();

    expect(screen.getByText("Compared 5 strikes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add strike" })).not.toBeInTheDocument();
  });

  it("removes a strike row", () => {
    render(<StrikeLensComparison />);
    fireEvent.click(screen.getByRole("button", { name: "Add strike" }));
    expect(screen.getAllByLabelText("Strike (₹)")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Remove strike 2" }));
    expect(screen.getAllByLabelText("Strike (₹)")).toHaveLength(1);
  });

  it("flags a premium below intrinsic as inconsistent without blocking the rest", () => {
    render(<StrikeLensComparison />);
    fillSpot("100");
    fillRow(0, "95", "2");
    fireEvent.click(screen.getByRole("button", { name: "Add strike" }));
    fillRow(1, "105", "3");
    compare();

    expect(screen.getByText("Check premium")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("cannot be negative");
    // The consistent row still renders its premium and extrinsic values.
    expect(screen.getAllByText("₹3.00")).toHaveLength(2);
  });

  it("compares PE strikes with put arithmetic", () => {
    render(<StrikeLensComparison />);
    fireEvent.click(screen.getByLabelText("PE (Put)"));
    fillSpot("100");
    fillRow(0, "105", "8");
    compare();

    expect(screen.getByText("ITM")).toBeInTheDocument();
    expect(screen.getByText("₹5.00")).toBeInTheDocument();
    expect(screen.getByText("₹97.00")).toBeInTheDocument();
  });

  it("clears a stale result when the option type switches", () => {
    render(<StrikeLensComparison />);
    fillSpot("100");
    fillRow(0, "95", "8");
    compare();
    expect(screen.getByText("Compared 1 strike")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("PE (Put)"));
    expect(screen.getByText("Your comparison will appear here")).toBeInTheDocument();
    expect(screen.queryByText("Compared 1 strike")).not.toBeInTheDocument();
  });
});

describe("StrikeLensComparison validation", () => {
  it("requires a spot price", () => {
    render(<StrikeLensComparison />);
    fillRow(0, "95", "8");
    compare();

    expect(screen.getByText("Spot is required.")).toBeInTheDocument();
    expect(screen.queryByText(/Compared/)).not.toBeInTheDocument();
  });

  it("rejects duplicate strikes without comparing", () => {
    render(<StrikeLensComparison />);
    fillSpot("100");
    fillRow(0, "95", "8");
    fireEvent.click(screen.getByRole("button", { name: "Add strike" }));
    fillRow(1, "95", "3");
    compare();

    expect(screen.getByText(/Each strike must be unique\./)).toBeInTheDocument();
    expect(screen.queryByText(/Compared/)).not.toBeInTheDocument();
  });

  it("rejects non-numeric premiums", () => {
    render(<StrikeLensComparison />);
    fillSpot("100");
    fillRow(0, "95", "abc");
    compare();

    expect(
      screen.getByText("Premium must be a number with up to 2 decimals (e.g. 123.45)."),
    ).toBeInTheDocument();
  });

  it("shows the breakeven label and not investment advice", () => {
    render(<StrikeLensComparison />);
    fillSpot("100");
    fillRow(0, "95", "8");
    compare();

    expect(screen.getByText("Option breakeven before transaction costs")).toBeInTheDocument();
    expect(screen.getByText(/Not investment advice\./)).toBeInTheDocument();
  });

  it("prefills spot from a handoff", () => {
    render(<StrikeLensComparison initialFields={{ spot: "100" }} />);

    expect(screen.getByLabelText("Spot (₹)")).toHaveValue("100");
    expect(screen.getByText("Spot carried forward")).toBeInTheDocument();
  });
});
