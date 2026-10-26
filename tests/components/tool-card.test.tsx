import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToolCard } from "@/components/ui/tool-card";
import { TOOLS } from "@/config/tools";

const riskGuard = TOOLS.find((tool) => tool.id === "risk-guard");
const planned = TOOLS.find((tool) => tool.status === "planned");

if (!riskGuard || !planned) {
  throw new Error("Tool registry must contain RiskGuard and at least one planned tool");
}

describe("ToolCard", () => {
  it("presents the tool name as a heading with its purpose", () => {
    render(<ToolCard tool={riskGuard} />);

    expect(screen.getByRole("heading", { level: 3, name: "RiskGuard" })).toBeInTheDocument();
    expect(screen.getByText(riskGuard.summary)).toBeInTheDocument();
  });

  it("states the current status in words", () => {
    render(<ToolCard tool={riskGuard} />);

    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("never presents a planned tool as available", () => {
    render(<ToolCard tool={planned} />);

    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

  it("keeps the identity icon decorative", () => {
    const { container } = render(<ToolCard tool={riskGuard} />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
