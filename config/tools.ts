export const TOOL_STATUSES = ["live", "coming_soon", "planned"] as const;
export type ToolStatus = (typeof TOOL_STATUSES)[number];

/**
 * Tool groups are the navigation model for the toolkit. Order here is the
 * order shown on the tools index and the landing page.
 */
export const TOOL_GROUPS = [
  {
    id: "plan-risk",
    name: "Plan & Risk",
    description: "Size the trade before the market does.",
  },
  {
    id: "options",
    name: "Options",
    description: "Understand premium, strikes and positioning.",
  },
  {
    id: "structure-setup",
    name: "Structure & Setup",
    description: "Read structure and grade your own written criteria.",
  },
  {
    id: "behaviour-review",
    name: "Behaviour & Review",
    description: "Find leaks and build a repeatable review habit.",
  },
] as const;

export type ToolGroup = (typeof TOOL_GROUPS)[number];
export type ToolGroupId = ToolGroup["id"];

/** Shape every tool entry must satisfy. Not exported: `Tool` is the source. */
type ToolEntry = {
  /** Stable internal identifier. */
  id: string;
  /** URL segment reserved for the tool. */
  slug: string;
  name: string;
  /** One-line description of the intended job. Never a functionality claim. */
  summary: string;
  group: ToolGroupId;
  status: ToolStatus;
};

/**
 * Single source of truth for the ten tools. The literal `as const` makes every
 * `id` a union member, so consumers such as the tool icon map are exhaustive:
 * adding a tool without an icon is a type error.
 */
export const TOOLS = [
  {
    id: "risk-guard",
    slug: "risk-guard",
    name: "RiskGuard",
    summary: "Size a trade against your capital, stop distance and daily risk budget.",
    group: "plan-risk",
    status: "live",
  },
  {
    id: "trade-plan",
    slug: "trade-plan",
    name: "TradePlan",
    summary: "Turn an idea into a structured plan with entry, stop, targets and checkpoints.",
    group: "plan-risk",
    status: "live",
  },
  {
    id: "trade-cost",
    slug: "trade-cost",
    name: "TradeCost",
    summary: "Estimate brokerage, taxes and charges before you place the order.",
    group: "plan-risk",
    status: "live",
  },
  {
    id: "strike-lens",
    slug: "strike-lens",
    name: "StrikeLens",
    summary: "Compare option strikes on premium, breakeven and payoff at expiry.",
    group: "options",
    status: "planned",
  },
  {
    id: "greek-map",
    slug: "greek-map",
    name: "GreekMap",
    summary: "Read how delta, theta and other Greeks change across strikes.",
    group: "options",
    status: "planned",
  },
  {
    id: "oi-mapper",
    slug: "oi-mapper",
    name: "OI Mapper",
    summary: "Organise open-interest data you import to see where positioning is concentrated.",
    group: "options",
    status: "planned",
  },
  {
    id: "structure-map",
    slug: "structure-map",
    name: "StructureMap",
    summary: "Mark swing highs, lows and market structure from the data you enter.",
    group: "structure-setup",
    status: "planned",
  },
  {
    id: "setup-score",
    slug: "setup-score",
    name: "SetupScore",
    summary: "Score a setup against your own written criteria, consistently.",
    group: "structure-setup",
    status: "planned",
  },
  {
    id: "leak-detector",
    slug: "leak-detector",
    name: "LeakDetector",
    summary: "Find recurring cost and behaviour leaks in your own trade history.",
    group: "behaviour-review",
    status: "planned",
  },
  {
    id: "review-os",
    slug: "review-os",
    name: "ReviewOS",
    summary: "Review finished trades with a repeatable process and structured notes.",
    group: "behaviour-review",
    status: "planned",
  },
] as const satisfies readonly ToolEntry[];

export type Tool = (typeof TOOLS)[number];
export type ToolId = Tool["id"];

/** Tools belonging to a group, in registry order. */
export function toolsInGroup(groupId: ToolGroupId): Tool[] {
  return TOOLS.filter((tool) => tool.group === groupId);
}

/** Live status ledger for the registry, so no page restates the counts. */
export function statusCounts(): Record<ToolStatus, number> {
  const counts: Record<ToolStatus, number> = { live: 0, coming_soon: 0, planned: 0 };

  for (const tool of TOOLS) {
    counts[tool.status] += 1;
  }

  return counts;
}
