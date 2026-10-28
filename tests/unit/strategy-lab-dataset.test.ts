import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  hashCanonicalCsv,
  parseDatasetCsv,
  sha256Hex,
  validateDataset,
} from "@/features/strategy-lab/dataset";
import type { Bar } from "@/features/strategy-lab/types";
import {
  parseDateField,
  parsePaiseField,
  parseSymbolField,
  parseVolumeField,
  validateManifestShape,
} from "@/features/strategy-lab/validation";

const HEADER = "date,symbol,open,high,low,close,volume";

function csv(rows: string[]): string {
  return [HEADER, ...rows].join("\n") + "\n";
}

const GOOD_ROWS = [
  "2026-09-01,DEMO,100.00,102.50,99.50,101.25,125000",
  "2026-09-02,DEMO,101.25,103.00,100.75,102.40,0",
  "2026-09-04,DEMO,102.40,102.90,101.10,101.80,118200",
];

function baseManifest(): Record<string, unknown> {
  return {
    datasetId: "slab-sample-daily-001",
    version: "1.0.0",
    source: "synthetic fixture",
    sourceReference: "synthetic:v1",
    retrievedAt: "2026-10-28",
    sha256: hashCanonicalCsv(csv(GOOD_ROWS)),
    timezone: "Asia/Kolkata",
    session: "09:15-15:30 Asia/Kolkata",
    barInterval: "1d",
    adjustment: "split-bonus-adjusted; dividends excluded",
    universe: ["DEMO"],
    dateRange: { start: "2026-09-01", end: "2026-09-04" },
    rowCount: 3,
  };
}

describe("sha256Hex", () => {
  it("matches the NIST empty-string vector", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("matches the NIST abc vector", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic and byte-sensitive", () => {
    const text = csv(GOOD_ROWS);
    expect(hashCanonicalCsv(text)).toBe(hashCanonicalCsv(text));
    expect(hashCanonicalCsv(text + " ")).not.toBe(hashCanonicalCsv(text));
  });

  it("normalizes CRLF and lone CR to LF before hashing", () => {
    const lf = csv(GOOD_ROWS);
    const crlf = lf.replace(/\n/g, "\r\n");
    const cr = lf.replace(/\n/g, "\r");
    expect(hashCanonicalCsv(crlf)).toBe(hashCanonicalCsv(lf));
    expect(hashCanonicalCsv(cr)).toBe(hashCanonicalCsv(lf));
  });

  it("rejects BOM and non-ASCII input", () => {
    expect(() => hashCanonicalCsv("﻿" + csv(GOOD_ROWS))).toThrow(RangeError);
    expect(() => hashCanonicalCsv(csv(GOOD_ROWS) + "café")).toThrow(RangeError);
    expect(() => sha256Hex("naïve")).toThrow(RangeError);
  });
});

describe("parsePaiseField", () => {
  it.each([
    ["100", 10000],
    ["100.5", 10050],
    ["100.50", 10050],
    ["0.01", 1],
    ["  42.07  ", 4207],
    ["1000000000", 100000000000],
    ["1000000000.00", 100000000000],
  ] as Array<[string, number]>)("parses %s to %i paise", (raw, expected) => {
    expect(parsePaiseField(raw)).toBe(expected);
  });

  it.each([
    [""],
    ["abc"],
    ["100.123"],
    ["NaN"],
    ["Infinity"],
    ["-100"],
    ["1,000"],
    ["100."],
    [".5"],
    ["1000000000.01"],
  ])("rejects %s", (raw) => {
    expect(parsePaiseField(raw)).toBeNull();
  });
});

describe("parseVolumeField", () => {
  it("accepts integers and zero", () => {
    expect(parseVolumeField("125000")).toBe(125000);
    expect(parseVolumeField("0")).toBe(0);
  });

  it.each([[""], ["12.5"], ["-1"], ["1,000"], ["abc"], ["9007199254740993"]])(
    "rejects %s",
    (raw) => {
      expect(parseVolumeField(raw)).toBeNull();
    },
  );
});

describe("parseDateField / parseSymbolField", () => {
  it("accepts canonical dates", () => {
    expect(parseDateField("2026-09-01")).toBe("2026-09-01");
  });

  it.each([
    ["2026-1-5"],
    ["05/01/2026"],
    ["2026-02-30"],
    ["2026-13-01"],
    ["2026-00-10"],
    ["1899-12-31"],
    [""],
    ["not-a-date"],
  ])("rejects %s", (raw) => {
    expect(parseDateField(raw)).toBeNull();
  });

  it("accepts exchange-style symbols and rejects the rest", () => {
    expect(parseSymbolField("DEMO")).toBe("DEMO");
    expect(parseSymbolField("NIFTY-1")).toBe("NIFTY-1");
    expect(parseSymbolField("")).toBeNull();
    expect(parseSymbolField("demo")).toBeNull();
    expect(parseSymbolField("A B")).toBeNull();
  });
});

describe("parseDatasetCsv valid input", () => {
  it("parses a valid single-symbol fixture with exact paise and frozen bars", () => {
    const result = parseDatasetCsv(csv(GOOD_ROWS));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.bars).toHaveLength(3);
    expect(result.bars[0]).toEqual({
      date: "2026-09-01",
      symbol: "DEMO",
      openPaise: 10000,
      highPaise: 10250,
      lowPaise: 9950,
      closePaise: 10125,
      volume: 125000,
    });
    expect(result.bars[1]?.volume).toBe(0);
    expect(Object.isFrozen(result.bars)).toBe(true);
    for (const bar of result.bars) {
      expect(Object.isFrozen(bar)).toBe(true);
    }
  });

  it("accepts missing trading days as gaps without synthesizing bars", () => {
    const result = parseDatasetCsv(csv(GOOD_ROWS));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    // 2026-09-03 is absent: exactly 3 bars, no interpolation.
    expect(result.bars.map((bar) => bar.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-04"]);
  });
});

describe("parseDatasetCsv ordering", () => {
  it("rejects reversed rows", () => {
    const result = parseDatasetCsv(csv([...GOOD_ROWS].reverse()));
    expect(result.status).toBe("invalid");
  });

  it("rejects duplicate dates", () => {
    const result = parseDatasetCsv(csv([GOOD_ROWS[0] as string, GOOD_ROWS[0] as string]));
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.errors.some((error) => error.reason.includes("Duplicate"))).toBe(true);
    }
  });

  it("rejects wrong headers, bad field counts, and blank rows", () => {
    expect(parseDatasetCsv("date,symbol,open\n2026-09-01,DEMO,1").status).toBe("invalid");
    expect(parseDatasetCsv(csv(["2026-09-01,DEMO,100,101,99,100"])).status).toBe("invalid");
    expect(parseDatasetCsv(csv([GOOD_ROWS[0] as string, "", GOOD_ROWS[1] as string])).status).toBe(
      "invalid",
    );
    expect(parseDatasetCsv("").status).toBe("invalid");
    expect(parseDatasetCsv(HEADER + "\n").status).toBe("invalid");
  });
});

describe("parseDatasetCsv OHLC validity", () => {
  const cases: Array<[string, string]> = [
    ["2026-09-01,DEMO,100,99,98,100,10", "high below open"],
    ["2026-09-01,DEMO,100,101,98,102,10", "high below close"],
    ["2026-09-01,DEMO,100,101,101,100,10", "low above open"],
    ["2026-09-01,DEMO,99,101,100,100,10", "low above close"],
    ["2026-09-01,DEMO,0,101,99,100,10", "non-positive open"],
    ["2026-09-01,DEMO,100,101,99,100.123,10", "malformed precision"],
    ["2026-09-01,DEMO,-5,101,99,100,10", "negative price"],
  ];
  it.each(cases)("rejects row with %s", (row) => {
    expect(parseDatasetCsv(csv([row])).status).toBe("invalid");
  });
});

describe("validateManifestShape", () => {
  it("accepts a well-formed manifest", () => {
    expect(validateManifestShape(baseManifest()).status).toBe("ok");
  });

  it("rejects non-objects and every wrong constant", () => {
    expect(validateManifestShape(null).status).toBe("invalid");
    for (const patch of [
      { timezone: "UTC" },
      { session: "09:15-15:30" },
      { barInterval: "1h" },
      { adjustment: "raw" },
      { sha256: "xyz" },
      { universe: ["DEMO", "EXTRA"] },
      { universe: [] },
      { rowCount: 0 },
      { retrievedAt: "09/01/2026" },
      { dateRange: { start: "2026-09-04", end: "2026-09-01" } },
    ]) {
      expect(validateManifestShape({ ...baseManifest(), ...patch }).status).toBe("invalid");
    }
  });
});

describe("validateDataset cross-checks", () => {
  it("accepts matching CSV and manifest", () => {
    const result = validateDataset(csv(GOOD_ROWS), baseManifest());
    expect(result.status).toBe("ok");
  });

  it("rejects mismatched rowCount, dateRange, sha, and universe", () => {
    const text = csv(GOOD_ROWS);
    expect(validateDataset(text, { ...baseManifest(), rowCount: 99 }).status).toBe("invalid");
    expect(
      validateDataset(text, {
        ...baseManifest(),
        dateRange: { start: "2026-09-01", end: "2026-09-05" },
      }).status,
    ).toBe("invalid");
    expect(validateDataset(text, { ...baseManifest(), sha256: "0".repeat(64) }).status).toBe(
      "invalid",
    );
    expect(
      validateDataset(csv(["2026-09-01,OTHER,100,101,99,100,10"]), baseManifest()).status,
    ).toBe("invalid");
  });
});

describe("golden fixture", () => {
  const dir = join(process.cwd(), "features", "strategy-lab", "fixtures");
  const csvText = readFileSync(join(dir, "sample-bars.csv"), "utf8");
  const manifestRaw = JSON.parse(
    readFileSync(join(dir, "sample-bars.manifest.json"), "utf8"),
  ) as unknown;

  it("verifies manifest hash, rowCount, and dateRange against the checked-in CSV", () => {
    const result = validateDataset(csvText, manifestRaw);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.manifest.sha256).toBe(hashCanonicalCsv(csvText));
    expect(result.manifest.rowCount).toBe(result.bars.length);
    expect(result.manifest.rowCount).toBe(15);
    const first = result.bars[0] as Bar;
    const last = result.bars[result.bars.length - 1] as Bar;
    expect(result.manifest.dateRange).toEqual({ start: first.date, end: last.date });
    expect(result.manifest.dateRange).toEqual({ start: "2026-09-01", end: "2026-09-21" });
  });

  it("returns immutable bars and manifest to consumers", () => {
    const result = validateDataset(csvText, manifestRaw);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(Object.isFrozen(result.bars)).toBe(true);
    expect(Object.isFrozen(result.manifest)).toBe(true);
    const bars = result.bars as Bar[];
    expect(() => {
      bars.push({} as Bar);
    }).toThrow(TypeError);
    const first = result.bars[0] as Bar;
    expect(() => {
      (first as { closePaise: number }).closePaise = 1;
    }).toThrow(TypeError);
    expect(first.closePaise).toBe(10125);
  });
});
