import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TradePlanChecker } from "@/features/trade-plan/components/trade-plan-checker";

function fillValidPlan() {
  fireEvent.change(screen.getByLabelText("Setup name"), { target: { value: "Breakout retest" } });
  fireEvent.change(screen.getByLabelText("Thesis"), {
    target: { value: "Price reclaimed the level and held." },
  });
  fireEvent.change(screen.getByLabelText("Invalidation"), {
    target: { value: "A close back below the level." },
  });
  fireEvent.change(screen.getByLabelText("Entry (₹)"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Stop-loss (₹)"), { target: { value: "95" } });
  fireEvent.change(screen.getByLabelText("Target (₹)"), { target: { value: "110" } });
}

describe("TradePlanChecker handoff", () => {
  it("exposes a sizing handoff with entry, stop and target when the plan is coherent", () => {
    render(<TradePlanChecker />);
    fillValidPlan();
    fireEvent.click(screen.getByRole("button", { name: "Check my plan" }));

    const link = screen.getByRole("link", { name: "Size this trade in RiskGuard" });
    expect(link).toHaveAttribute(
      "href",
      "/tools/risk-guard?direction=long&entry=100&stop=95&target=110",
    );
  });

  it("omits the target from the handoff when the plan has none", () => {
    render(<TradePlanChecker />);
    fillValidPlan();
    fireEvent.change(screen.getByLabelText("Target (₹)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Check my plan" }));

    const link = screen.getByRole("link", { name: "Size this trade in RiskGuard" });
    expect(link).toHaveAttribute("href", "/tools/risk-guard?direction=long&entry=100&stop=95");
  });

  it("never puts narrative text into the handoff URL", () => {
    render(<TradePlanChecker />);
    fillValidPlan();
    fireEvent.click(screen.getByRole("button", { name: "Check my plan" }));

    const href = screen
      .getByRole("link", { name: "Size this trade in RiskGuard" })
      .getAttribute("href");
    expect(href).not.toContain("Breakout");
    expect(href).not.toContain("reclaimed");
    expect(href).not.toContain("Invalidation");
  });

  it("does not expose a sizing handoff when the stop makes the plan incoherent", () => {
    render(<TradePlanChecker />);
    fillValidPlan();
    fireEvent.change(screen.getByLabelText("Stop-loss (₹)"), { target: { value: "105" } });
    fireEvent.click(screen.getByRole("button", { name: "Check my plan" }));

    expect(screen.getByText("Plan incoherent")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Size this trade in RiskGuard" }),
    ).not.toBeInTheDocument();
  });
});
