import { describe, expect, it } from "vitest";

import { TOOL_GROUPS, TOOLS, statusCounts, toolsInGroup, type ToolStatus } from "@/config/tools";

describe("tool registry", () => {
  it("contains the ten planned tools", () => {
    expect(TOOLS).toHaveLength(10);
    expect(TOOLS.map((tool) => tool.name)).toEqual([
      "RiskGuard",
      "TradePlan",
      "TradeCost",
      "StrikeLens",
      "GreekMap",
      "OI Mapper",
      "StructureMap",
      "SetupScore",
      "LeakDetector",
      "ReviewOS",
    ]);
  });

  it("keeps ids and slugs unique", () => {
    expect(new Set(TOOLS.map((tool) => tool.id)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map((tool) => tool.slug)).size).toBe(TOOLS.length);
  });

  it("marks RiskGuard, TradePlan and TradeCost as live and everything else as planned", () => {
    expect(TOOLS.find((tool) => tool.id === "risk-guard")?.status).toBe("live");
    expect(TOOLS.find((tool) => tool.id === "trade-plan")?.status).toBe("live");
    expect(TOOLS.find((tool) => tool.id === "trade-cost")?.status).toBe("live");

    const others = TOOLS.filter(
      (tool) => tool.id !== "risk-guard" && tool.id !== "trade-plan" && tool.id !== "trade-cost",
    );
    expect(others.every((tool) => tool.status === "planned")).toBe(true);
  });

  it("claims three live tools", () => {
    const statuses: ToolStatus[] = TOOLS.map((tool) => tool.status);

    expect(statuses.filter((status) => status === "live")).toHaveLength(3);
  });

  it("assigns every tool to a declared group", () => {
    const groupIds = new Set(TOOL_GROUPS.map((group) => group.id));

    for (const tool of TOOLS) {
      expect(groupIds.has(tool.group)).toBe(true);
    }
  });

  it("gives every group at least one tool", () => {
    for (const group of TOOL_GROUPS) {
      expect(toolsInGroup(group.id).length).toBeGreaterThan(0);
    }
  });

  it("partitions every tool into exactly one group", () => {
    const grouped = TOOL_GROUPS.flatMap((group) => toolsInGroup(group.id));

    expect(grouped).toHaveLength(TOOLS.length);
    expect(new Set(grouped.map((tool) => tool.id)).size).toBe(TOOLS.length);
  });

  it("reports a status ledger that matches the registry", () => {
    const counts = statusCounts();

    expect(counts.live).toBe(3);
    expect(counts.coming_soon).toBe(0);
    expect(counts.planned).toBe(7);
    expect(counts.live + counts.coming_soon + counts.planned).toBe(TOOLS.length);
  });
});
