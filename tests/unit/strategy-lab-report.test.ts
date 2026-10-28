import { describe, expect, it } from "vitest";

import { formatINR, formatRatePercent } from "@/app/lab/format";
import { loadStrategyLabReport } from "@/app/lab/report";
import { BACKTEST_BROKERAGE_PAISE } from "@/features/strategy-lab/costs";
import { SENSITIVITY_REFERENCE_BPS } from "@/features/strategy-lab/sensitivity";
import {
  SMA_CROSS_STRATEGY_ID,
  SMA_CROSS_STRATEGY_VERSION,
} from "@/features/strategy-lab/strategies/sma-cross";
import { RESEARCH_SPLIT_DATE, RESEARCH_SPLIT_ID } from "@/features/strategy-lab/metrics";
import { STRATEGY_LAB_REFERENCE_PARAMS } from "@/features/strategy-lab/types";

describe("strategy lab report loader", () => {
  it("runs the frozen pipeline over the synthetic fixture", () => {
    const report = loadStrategyLabReport();
    expect(report.status).toBe("ok");
    if (report.status !== "ok") {
      return;
    }

    expect(report.manifest.datasetId).toBe("slab-sample-daily-001");
    expect(report.manifest.version).toBe("1.0.0");
    expect(report.manifest.rowCount).toBe(15);
    expect(report.manifest.dateRange).toEqual({ start: "2026-09-01", end: "2026-09-21" });

    expect(report.strategy.id).toBe(SMA_CROSS_STRATEGY_ID);
    expect(report.strategy.version).toBe(SMA_CROSS_STRATEGY_VERSION);
    expect(report.strategy.params).toEqual(STRATEGY_LAB_REFERENCE_PARAMS);
    expect(report.strategy.brokeragePaise).toBe(BACKTEST_BROKERAGE_PAISE);

    expect(report.research.status).toBe("ok");
    expect(report.research.splitId).toBe(RESEARCH_SPLIT_ID);
    expect(report.research.splitDate).toBe(RESEARCH_SPLIT_DATE);
    expect(report.research.splitDate).toBe("2026-09-14");
    expect(report.research.referenceBps).toBe(SENSITIVITY_REFERENCE_BPS);
    expect(report.research.legs.map((leg) => leg.slippageBps)).toEqual([0, 5, 10]);
  });

  it("keeps the headline as the 5 bps OOS partition itself, not a copy", () => {
    const report = loadStrategyLabReport();
    expect(report.status).toBe("ok");
    if (report.status !== "ok") {
      return;
    }
    expect(report.research.referenceOos).toBe(report.research.legs[1]?.oos);
  });

  it("keeps reference trade evidence consistent with the reference partition", () => {
    const report = loadStrategyLabReport();
    expect(report.status).toBe("ok");
    if (report.status !== "ok") {
      return;
    }
    expect(report.referenceTrades.length).toBe(report.research.legs[1]?.all.tradeCount);
  });

  it("is byte-identical for repeated loads", () => {
    expect(JSON.stringify(loadStrategyLabReport())).toBe(JSON.stringify(loadStrategyLabReport()));
  });
});

describe("report formatters", () => {
  it("formats integer paise as exact rupees with Indian grouping", () => {
    expect(formatINR(0)).toBe("₹0.00");
    expect(formatINR(1)).toBe("₹0.01");
    expect(formatINR(2000)).toBe("₹20.00");
    expect(formatINR(100000)).toBe("₹1,000.00");
    expect(formatINR(10000000)).toBe("₹1,00,000.00");
    expect(formatINR(123456789)).toBe("₹12,34,567.89");
    expect(formatINR(-987654321)).toBe("-₹98,76,543.21");
  });

  it("formats frozen win-rate decimals as percents without touching floats", () => {
    expect(formatRatePercent("0.333333")).toBe("33.3333%");
    expect(formatRatePercent("1.000000")).toBe("100.0000%");
    expect(formatRatePercent("0.000000")).toBe("0.0000%");
    expect(formatRatePercent("0.500000")).toBe("50.0000%");
    expect(formatRatePercent("-0.500000")).toBe("-50.0000%");
  });

  it("rejects non-decimal input rather than guessing", () => {
    expect(() => formatRatePercent("high")).toThrow(RangeError);
  });
});
