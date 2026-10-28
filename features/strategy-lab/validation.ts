import type { Paise } from "@/types/domain";

import {
  STRATEGY_LAB_ADJUSTMENT,
  STRATEGY_LAB_BAR_INTERVAL,
  STRATEGY_LAB_MAX_PAISE,
  STRATEGY_LAB_MAX_VOLUME,
  STRATEGY_LAB_SESSION,
  STRATEGY_LAB_TIMEZONE,
  type DatasetManifest,
  type StrategyParams,
} from "@/features/strategy-lab/types";

/**
 * External boundary validation for the Strategy Lab dataset (M1-A).
 *
 * Owns parsing of raw CSV field strings into domain values. Never throws for
 * data outcomes: every parser returns null for invalid input and the dataset
 * layer converts that into a row-numbered issue. Only programmer-precondition
 * violations (non-string input where the type system was bypassed) throw.
 *
 * Money is parsed by exact string splitting — never `parseFloat`, never
 * `Number()` on a decimal — so `100.50` is exactly `10050` paise.
 */

/** One row-numbered dataset problem. Row 0 means manifest-level, not a bar. */
export interface FieldIssue {
  row: number;
  field: string;
  reason: string;
}

export type ManifestShapeResult =
  { status: "ok"; manifest: DatasetManifest } | { status: "invalid"; errors: FieldIssue[] };

const MAX_PAISE_DIGITS = "100000000000"; // ₹100 crore in paise, digit form

/**
 * Parses a CSV price field (`"100"`, `"100.5"`, `"100.50"`) to integer paise.
 * Returns null for empty, non-numeric, negative, >2-decimal, or over-cap
 * input. Zero parses (bar-level `> 0` rules reject it where required).
 */
export function parsePaiseField(raw: string): Paise | null {
  const text = raw.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (match === null) {
    return null;
  }
  const rupees = match[1] as string;
  const decimals = (match[2] ?? "") as string;
  const paiseDigits = rupees + decimals.padEnd(2, "0");
  const stripped = paiseDigits.replace(/^0+(?=\d)/, "");
  const canonical = stripped === "" ? "0" : stripped;
  if (
    canonical.length > MAX_PAISE_DIGITS.length ||
    (canonical.length === MAX_PAISE_DIGITS.length && canonical > MAX_PAISE_DIGITS)
  ) {
    return null;
  }
  const value = Number(canonical);
  if (!Number.isSafeInteger(value) || value > STRATEGY_LAB_MAX_PAISE) {
    return null;
  }
  return value as Paise;
}

/**
 * Parses a CSV volume field. Whole non-negative safe integers within the
 * volume cap only. Zero is valid (a bar may print no volume).
 */
export function parseVolumeField(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const stripped = text.replace(/^0+(?=\d)/, "");
  const value = Number(stripped === "" ? "0" : stripped);
  if (!Number.isSafeInteger(value) || value > STRATEGY_LAB_MAX_VOLUME) {
    return null;
  }
  return value;
}

/**
 * Accepts canonical `YYYY-MM-DD` dates that exist on the calendar.
 * Rejects impossible dates (`2026-02-30`), non-canonical forms
 * (`2026-1-5`, `05/01/2026`), and anything outside 1900–2100.
 */
export function parseDateField(raw: string): string | null {
  const text = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }
  return text;
}

/**
 * Accepts exchange-style symbols: 1–32 chars of A–Z, 0–9, `.`, `-`.
 * No case folding or trimming forgiveness beyond outer whitespace — the
 * dataset must state its symbols exactly.
 */
export function parseSymbolField(raw: string): string | null {
  const text = raw.trim();
  if (!/^[A-Z0-9.\-]{1,32}$/.test(text)) {
    return null;
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates the shape of a parsed manifest object (field presence and form).
 * Cross-checks against actual bars (hash, row count, date range, universe)
 * belong to `dataset.ts`, not here.
 */
export function validateManifestShape(raw: unknown): ManifestShapeResult {
  const errors: FieldIssue[] = [];
  const reject = (field: string, reason: string): void => {
    errors.push({ row: 0, field, reason });
  };

  if (!isRecord(raw)) {
    return {
      status: "invalid",
      errors: [{ row: 0, field: "manifest", reason: "Manifest must be a JSON object." }],
    };
  }

  if (!nonEmptyString(raw["datasetId"])) {
    reject("datasetId", "datasetId must be a non-empty string.");
  }
  if (!nonEmptyString(raw["version"])) {
    reject("version", "version must be a non-empty string.");
  }
  if (!nonEmptyString(raw["source"])) {
    reject("source", "source must be a non-empty string describing provenance.");
  }
  if (!nonEmptyString(raw["sourceReference"])) {
    reject("sourceReference", "sourceReference must be a non-empty retrieval pointer.");
  }
  if (
    !nonEmptyString(raw["retrievedAt"]) ||
    parseDateField(raw["retrievedAt"] as string) === null
  ) {
    reject("retrievedAt", "retrievedAt must be a canonical YYYY-MM-DD date.");
  }
  if (typeof raw["sha256"] !== "string" || !/^[0-9a-f]{64}$/.test(raw["sha256"] as string)) {
    reject("sha256", "sha256 must be 64 lowercase hex characters.");
  }
  if (raw["timezone"] !== STRATEGY_LAB_TIMEZONE) {
    reject("timezone", `timezone must be exactly "${STRATEGY_LAB_TIMEZONE}".`);
  }
  if (raw["session"] !== STRATEGY_LAB_SESSION) {
    reject("session", `session must be exactly "${STRATEGY_LAB_SESSION}".`);
  }
  if (raw["barInterval"] !== STRATEGY_LAB_BAR_INTERVAL) {
    reject("barInterval", `barInterval must be exactly "${STRATEGY_LAB_BAR_INTERVAL}".`);
  }
  if (raw["adjustment"] !== STRATEGY_LAB_ADJUSTMENT) {
    reject("adjustment", `adjustment must be exactly "${STRATEGY_LAB_ADJUSTMENT}".`);
  }

  const universe = raw["universe"];
  if (
    !Array.isArray(universe) ||
    universe.length !== 1 ||
    parseSymbolField(String(universe[0] ?? "")) === null
  ) {
    reject("universe", "universe must be an array with exactly one valid M1 symbol.");
  }

  const dateRange = raw["dateRange"];
  if (!isRecord(dateRange)) {
    reject("dateRange", "dateRange must be an object with start and end.");
  } else {
    if (parseDateField(String(dateRange["start"] ?? "")) === null) {
      reject("dateRange.start", "dateRange.start must be a canonical YYYY-MM-DD date.");
    }
    if (parseDateField(String(dateRange["end"] ?? "")) === null) {
      reject("dateRange.end", "dateRange.end must be a canonical YYYY-MM-DD date.");
    }
    if (
      parseDateField(String(dateRange["start"] ?? "")) !== null &&
      parseDateField(String(dateRange["end"] ?? "")) !== null &&
      String(dateRange["start"]) > String(dateRange["end"])
    ) {
      reject("dateRange", "dateRange.start must not be after dateRange.end.");
    }
  }

  const rowCount = raw["rowCount"];
  if (typeof rowCount !== "number" || !Number.isSafeInteger(rowCount) || (rowCount as number) < 1) {
    reject("rowCount", "rowCount must be a safe integer of at least 1.");
  }

  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  const manifest: DatasetManifest = {
    datasetId: (raw["datasetId"] as string).trim(),
    version: (raw["version"] as string).trim(),
    source: (raw["source"] as string).trim(),
    sourceReference: (raw["sourceReference"] as string).trim(),
    retrievedAt: (raw["retrievedAt"] as string).trim(),
    sha256: raw["sha256"] as string,
    timezone: STRATEGY_LAB_TIMEZONE,
    session: STRATEGY_LAB_SESSION,
    barInterval: STRATEGY_LAB_BAR_INTERVAL,
    adjustment: STRATEGY_LAB_ADJUSTMENT,
    universe: [parseSymbolField(String((universe as unknown[])[0])) as string],
    dateRange: {
      start: String((dateRange as Record<string, unknown>)["start"]),
      end: String((dateRange as Record<string, unknown>)["end"]),
    },
    rowCount: raw["rowCount"] as number,
  };
  return { status: "ok", manifest };
}

export type StrategyParamsResult =
  { status: "ok"; params: StrategyParams } | { status: "invalid"; errors: FieldIssue[] };

/**
 * Validates a strategy parameter object against the locked M1 relations:
 * `0 < fastPeriod < slowPeriod`, `stopLookback >= 1`, `minBars >= slowPeriod`.
 * All values must be safe integers. No ranges, no defaults, no coercion.
 */
export function validateStrategyParams(raw: unknown): StrategyParamsResult {
  const errors: FieldIssue[] = [];
  const reject = (field: string, reason: string): void => {
    errors.push({ row: 0, field, reason });
  };

  if (!isRecord(raw)) {
    return {
      status: "invalid",
      errors: [{ row: 0, field: "params", reason: "Params must be an object." }],
    };
  }

  const checkInt = (field: string): number | null => {
    const value = raw[field];
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
      reject(field, `${field} must be a safe integer.`);
      return null;
    }
    return value;
  };

  const fast = checkInt("fastPeriod");
  const slow = checkInt("slowPeriod");
  const lookback = checkInt("stopLookback");
  const minBars = checkInt("minBars");

  if (fast !== null && fast < 1) {
    reject("fastPeriod", "fastPeriod must be at least 1.");
  }
  if (fast !== null && slow !== null && fast >= slow) {
    reject("fastPeriod", "fastPeriod must be strictly less than slowPeriod.");
  }
  if (lookback !== null && lookback < 1) {
    reject("stopLookback", "stopLookback must be at least 1.");
  }
  if (slow !== null && minBars !== null && minBars < slow) {
    reject("minBars", "minBars must be at least slowPeriod.");
  }

  if (errors.length > 0) {
    return { status: "invalid", errors };
  }
  return {
    status: "ok",
    params: {
      fastPeriod: fast as number,
      slowPeriod: slow as number,
      stopLookback: lookback as number,
      minBars: minBars as number,
    },
  };
}
