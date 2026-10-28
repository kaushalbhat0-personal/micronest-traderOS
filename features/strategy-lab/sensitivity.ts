import {
  runBacktest,
  type BacktestRunInput,
  type BacktestRunResult,
} from "@/features/strategy-lab/backtester";
import type { Bar, StrategyParams } from "@/features/strategy-lab/types";
import type { StrategyEvaluate } from "@/features/strategy-lab/strategy";

/**
 * Strategy Lab cost-sensitivity harness (M1-D) — the source of truth for the
 * 0/5/10 bps execution-cost comparison.
 *
 * Runs the exact same frozen M1-C backtest three times, varying only the
 * slippage leg, and preserves each complete backtest result for M1-E.
 * Delegates everything to `runBacktest`: no slippage math, no cost math, no
 * strategy evaluation, and no execution path of its own. Pure and
 * deterministic. This is execution-cost sensitivity, not optimization —
 * there is no search, no ranking, and no parameter choice here.
 */

/** The only M1-D legs, in deterministic ascending order. */
export const SENSITIVITY_SLIPPAGE_LEGS = [0, 5, 10] as const;

export type SensitivitySlippageBps = (typeof SENSITIVITY_SLIPPAGE_LEGS)[number];

/** The reference leg. Not a second calculation — one of the three legs. */
export const SENSITIVITY_REFERENCE_BPS = 5 as const;

/** Shared research inputs. Slippage is deliberately absent: legs are locked. */
export interface SensitivityInput {
  bars: readonly Bar[];
  evaluate: StrategyEvaluate;
  params: StrategyParams;
  quantity: number;
  brokeragePaise: number;
}

export interface SensitivityLeg {
  slippageBps: SensitivitySlippageBps;
  /** Complete underlying M1-C result. Trade-level detail is preserved. */
  result: BacktestRunResult;
}

export interface SensitivityIssue {
  field: string;
  reason: string;
}

export type SensitivityResult =
  | {
      status: "ok";
      referenceBps: typeof SENSITIVITY_REFERENCE_BPS;
      /** Fixed tuple: exactly three legs, always 0, 5, 10 bps in order. */
      legs: readonly [SensitivityLeg, SensitivityLeg, SensitivityLeg];
    }
  | { status: "invalid"; errors: SensitivityIssue[] };

function toRunInput(
  input: SensitivityInput,
  slippageBps: SensitivitySlippageBps,
): BacktestRunInput {
  return {
    bars: input.bars,
    evaluate: input.evaluate,
    params: input.params,
    quantity: input.quantity,
    slippageBps,
    brokeragePaise: input.brokeragePaise,
  };
}

export function runSensitivity(input: SensitivityInput): SensitivityResult {
  const legs = SENSITIVITY_SLIPPAGE_LEGS.map((slippageBps) => ({
    slippageBps,
    result: runBacktest(toRunInput(input, slippageBps)),
  })) as [SensitivityLeg, SensitivityLeg, SensitivityLeg];

  const errors: SensitivityIssue[] = [];
  for (const leg of legs) {
    if (leg.result.status === "invalid") {
      for (const issue of leg.result.errors) {
        errors.push({ field: `leg[${leg.slippageBps}].${issue.field}`, reason: issue.reason });
      }
    }
  }
  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  return Object.freeze({
    status: "ok",
    referenceBps: SENSITIVITY_REFERENCE_BPS,
    legs: Object.freeze(legs),
  }) as SensitivityResult;
}
