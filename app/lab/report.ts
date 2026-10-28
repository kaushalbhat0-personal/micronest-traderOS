import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { BacktestTrade } from "@/features/strategy-lab/backtester";
import { BACKTEST_BROKERAGE_PAISE } from "@/features/strategy-lab/costs";
import { validateDataset } from "@/features/strategy-lab/dataset";
import { analyzeResearch, type ResearchResult } from "@/features/strategy-lab/metrics";
import { runSensitivity } from "@/features/strategy-lab/sensitivity";
import {
  SMA_CROSS_STRATEGY_ID,
  SMA_CROSS_STRATEGY_VERSION,
  evaluateSmaCross,
} from "@/features/strategy-lab/strategies/sma-cross";
import {
  STRATEGY_LAB_REFERENCE_PARAMS,
  type DatasetManifest,
  type StrategyParams,
} from "@/features/strategy-lab/types";

/**
 * M1-F report loader — deterministic local data flow over the frozen M1 stack.
 *
 * Wires the existing fixture through the frozen orchestration only:
 * fixture CSV + manifest → `validateDataset` (M1-A) → `runSensitivity` (M1-D,
 * which delegates every leg to `runBacktest`, M1-C) → `analyzeResearch`
 * (M1-E). No backtest, strategy, metric, or cost logic lives here: every
 * figure the report shows is consumed verbatim from the returned objects.
 *
 * Locked fixture run configuration (mirrors the pinned M1-C fixture test):
 * one share per signal, ₹20.00 brokerage per fill, reference parameters.
 */
export const STRATEGY_LAB_REPORT_QUANTITY = 1;

export const STRATEGY_LAB_STRATEGY_NAME = "SMA cross with N-bar-low stop";

export type StrategyLabResearch = Extract<ResearchResult, { status: "ok" }>;

export interface StrategyLabReportOk {
  status: "ok";
  manifest: DatasetManifest;
  strategy: {
    id: typeof SMA_CROSS_STRATEGY_ID;
    name: typeof STRATEGY_LAB_STRATEGY_NAME;
    version: typeof SMA_CROSS_STRATEGY_VERSION;
    params: StrategyParams;
    quantity: typeof STRATEGY_LAB_REPORT_QUANTITY;
    brokeragePaise: typeof BACKTEST_BROKERAGE_PAISE;
  };
  /** Authoritative M1-E result. Every displayed metric is read from here. */
  research: StrategyLabResearch;
  /**
   * Authoritative M1-C trade records of the 5 bps reference leg, preserved by
   * the frozen M1-D result that produced `research`. Same pipeline run, same
   * objects — not a second data path. Shown verbatim as trade evidence only.
   */
  referenceTrades: readonly BacktestTrade[];
}

export type StrategyLabReportResult = StrategyLabReportOk | { status: "invalid"; reason: string };

function fail(reason: string): StrategyLabReportResult {
  return { status: "invalid", reason };
}

export function loadStrategyLabReport(): StrategyLabReportResult {
  let csvText: string;
  let manifestRaw: unknown;
  try {
    const dir = join(process.cwd(), "features", "strategy-lab", "fixtures");
    csvText = readFileSync(join(dir, "sample-bars.csv"), "utf8");
    manifestRaw = JSON.parse(readFileSync(join(dir, "sample-bars.manifest.json"), "utf8"));
  } catch {
    return fail("The synthetic fixture files could not be read.");
  }

  const validated = validateDataset(csvText, manifestRaw);
  if (validated.status !== "ok") {
    return fail("The synthetic fixture failed M1-A dataset validation.");
  }

  const sensitivity = runSensitivity({
    bars: validated.bars,
    evaluate: evaluateSmaCross,
    params: STRATEGY_LAB_REFERENCE_PARAMS,
    quantity: STRATEGY_LAB_REPORT_QUANTITY,
    brokeragePaise: BACKTEST_BROKERAGE_PAISE,
  });
  if (sensitivity.status !== "ok") {
    return fail("The frozen sensitivity harness did not return all three legs.");
  }

  const research = analyzeResearch(sensitivity);
  if (research.status !== "ok") {
    return fail("The frozen research metrics did not validate the sensitivity result.");
  }

  const referenceLeg = sensitivity.legs[1];
  if (referenceLeg?.slippageBps !== 5 || referenceLeg.result.status !== "ok") {
    return fail("The 5 bps reference leg is missing its complete backtest result.");
  }

  return Object.freeze({
    status: "ok",
    manifest: validated.manifest,
    strategy: Object.freeze({
      id: SMA_CROSS_STRATEGY_ID,
      name: STRATEGY_LAB_STRATEGY_NAME,
      version: SMA_CROSS_STRATEGY_VERSION,
      params: STRATEGY_LAB_REFERENCE_PARAMS,
      quantity: STRATEGY_LAB_REPORT_QUANTITY,
      brokeragePaise: BACKTEST_BROKERAGE_PAISE,
    }),
    research,
    referenceTrades: referenceLeg.result.trades,
  }) as StrategyLabReportOk;
}
