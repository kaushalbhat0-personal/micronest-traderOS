import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductShowcase } from "@/components/home/product-showcase";

const TOOLS = ["RiskGuard", "TradePlan", "TradeCost", "StrikeLens", "GreekMap"] as const;

function pressedStates(): Record<string, string | null> {
  const group = screen.getByRole("group", { name: "Choose a tool to preview" });
  const states: Record<string, string | null> = {};
  for (const name of TOOLS) {
    states[name] = within(group).getByRole("button", { name }).getAttribute("aria-pressed");
  }
  return states;
}

describe("ProductShowcase", () => {
  it("defaults to RiskGuard with its screenshot, outcome and live link", () => {
    render(<ProductShowcase />);

    expect(pressedStates()).toEqual({
      RiskGuard: "true",
      TradePlan: "false",
      TradeCost: "false",
      StrikeLens: "false",
      GreekMap: "false",
    });
    expect(screen.getByRole("img")).toHaveAttribute(
      "alt",
      expect.stringContaining("200 allowed units"),
    );
    expect(screen.getByText(/200 units within a/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open RiskGuard \u2192" })).toHaveAttribute(
      "href",
      "/tools/risk-guard",
    );
  });

  it("swaps screenshot, outcome and link when another tool is chosen", () => {
    render(<ProductShowcase />);

    fireEvent.click(screen.getByRole("button", { name: "TradePlan" }));

    expect(pressedStates()["TradePlan"]).toBe("true");
    expect(pressedStates()["RiskGuard"]).toBe("false");
    expect(screen.getByRole("img")).toHaveAttribute(
      "alt",
      expect.stringContaining("2.00 reward-to-risk"),
    );
    expect(screen.getByRole("link", { name: "Open TradePlan \u2192" })).toHaveAttribute(
      "href",
      "/tools/trade-plan",
    );
  });

  it("keeps exactly one selector pressed across every tool", () => {
    render(<ProductShowcase />);

    for (const name of TOOLS) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(Object.values(pressedStates()).filter((state) => state === "true")).toHaveLength(1);
    }
  });

  it("exposes native keyboard-focusable selectors", () => {
    render(<ProductShowcase />);

    for (const name of TOOLS) {
      const button = screen.getByRole("button", { name });
      expect(button.tagName).toBe("BUTTON");
      button.focus();
      expect(document.activeElement).toBe(button);
    }
  });
});
