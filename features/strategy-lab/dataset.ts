import {
  STRATEGY_LAB_CSV_HEADER,
  type Bar,
  type DatasetManifest,
} from "@/features/strategy-lab/types";
import {
  parseDateField,
  parsePaiseField,
  parseSymbolField,
  parseVolumeField,
  validateManifestShape,
  type FieldIssue,
} from "@/features/strategy-lab/validation";

/**
 * Strategy Lab dataset domain (M1-A) — the source of truth for the historical
 * bar boundary.
 *
 * Pure TypeScript: no React, no DOM, no clock, no network, no filesystem. The
 * SHA-256 below is a self-contained integer implementation (verified against
 * NIST vectors in tests) so hashing needs no dependency and no platform API.
 * Callers supply CSV text and manifest objects; this module returns frozen,
 * validated domain data. It never throws for data outcomes — malformed input
 * yields a structured `invalid` result. Only programmer-precondition
 * violations (hashing non-canonical bytes) throw, because that signals a
 * broken caller, not bad data.
 */

export type DatasetIssue = FieldIssue;

export type ParseDatasetResult =
  { status: "ok"; bars: readonly Bar[] } | { status: "invalid"; errors: DatasetIssue[] };

export type ValidateDatasetResult =
  | { status: "ok"; bars: readonly Bar[]; manifest: DatasetManifest }
  | { status: "invalid"; errors: DatasetIssue[] };

/**
 * Normalizes CSV text to canonical bytes: LF line endings, UTF-8, no BOM.
 * Throws RangeError for BOM or non-ASCII input — callers must reject such
 * files rather than silently rewrite them.
 */
export function canonicalizeCsv(csvText: string): string {
  if (csvText.length > 0 && csvText.charCodeAt(0) === 0xfeff) {
    throw new RangeError("CSV must not contain a byte-order mark.");
  }
  for (let i = 0; i < csvText.length; i += 1) {
    if (csvText.charCodeAt(i) > 127) {
      throw new RangeError(`CSV must be ASCII-only (first non-ASCII at offset ${i}).`);
    }
  }
  return csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * SHA-256 over an ASCII-only string, returned as 64 lowercase hex chars.
 * Throws RangeError for non-ASCII input, matching the canonical-bytes rule.
 */
export function sha256Hex(ascii: string): string {
  for (let i = 0; i < ascii.length; i += 1) {
    if (ascii.charCodeAt(i) > 127) {
      throw new RangeError("sha256Hex accepts ASCII-only input.");
    }
  }

  const bytes: number[] = [];
  for (let i = 0; i < ascii.length; i += 1) {
    bytes.push(ascii.charCodeAt(i));
  }
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0x00);
  }
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  bytes.push(
    (high >>> 24) & 0xff,
    (high >>> 16) & 0xff,
    (high >>> 8) & 0xff,
    high & 0xff,
    (low >>> 24) & 0xff,
    (low >>> 16) & 0xff,
    (low >>> 8) & 0xff,
    low & 0xff,
  );

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w: number[] = new Array<number>(64).fill(0);
  for (let block = 0; block < bytes.length; block += 64) {
    for (let i = 0; i < 16; i += 1) {
      const o = block + i * 4;
      w[i] =
        ((bytes[o] as number) << 24) |
        ((bytes[o + 1] as number) << 16) |
        ((bytes[o + 2] as number) << 8) |
        (bytes[o + 3] as number);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 =
        rotr(w[i - 15] as number, 7) ^
        rotr(w[i - 15] as number, 18) ^
        ((w[i - 15] as number) >>> 3);
      const s1 =
        rotr(w[i - 2] as number, 17) ^ rotr(w[i - 2] as number, 19) ^ ((w[i - 2] as number) >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + (SHA256_K[i] as number) + (w[i] as number)) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const word = (value: number): string => (value >>> 0).toString(16).padStart(8, "0");
  return word(h0) + word(h1) + word(h2) + word(h3) + word(h4) + word(h5) + word(h6) + word(h7);
}

/** SHA-256 of the canonicalized CSV bytes. Canonicalization failures throw. */
export function hashCanonicalCsv(csvText: string): string {
  return sha256Hex(canonicalizeCsv(csvText));
}

function freezeBars(bars: Bar[]): readonly Bar[] {
  for (const bar of bars) {
    Object.freeze(bar);
  }
  return Object.freeze(bars);
}

/**
 * Parses and validates CSV text into immutable domain bars.
 *
 * Accepts: exact header, 7 comma-separated fields per row, valid money/date/
 * volume/symbol fields, coherent OHLC, strictly ascending (symbol, date).
 * Rejects (never repairs): BOM, non-ASCII, wrong header, short/long rows,
 * blank interior rows, bad fields, incoherent OHLC, unsorted or duplicate
 * rows, empty datasets. Missing trading dates are preserved as gaps.
 */
export function parseDatasetCsv(csvText: string): ParseDatasetResult {
  const errors: DatasetIssue[] = [];
  const bad = (row: number, field: string, reason: string): void => {
    errors.push({ row, field, reason });
  };

  let text: string;
  try {
    text = canonicalizeCsv(csvText);
  } catch (error) {
    const reason = error instanceof RangeError ? error.message : "CSV is not canonical bytes.";
    return { status: "invalid", errors: [{ row: 0, field: "csv", reason }] };
  }

  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length === 0 || (lines.length === 1 && (lines[0] as string).trim() === "")) {
    return { status: "invalid", errors: [{ row: 0, field: "csv", reason: "CSV has no rows." }] };
  }

  const header = lines[0] as string;
  if (header.trim() !== STRATEGY_LAB_CSV_HEADER) {
    return {
      status: "invalid",
      errors: [
        { row: 1, field: "header", reason: `Header must be exactly "${STRATEGY_LAB_CSV_HEADER}".` },
      ],
    };
  }

  const bars: Bar[] = [];
  let previousKey: string | null = null;

  for (let index = 1; index < lines.length; index += 1) {
    const rowNumber = index + 1;
    const line = lines[index] as string;
    if (line.trim() === "") {
      bad(rowNumber, "row", "Blank rows are not allowed.");
      continue;
    }
    const fields = line.split(",");
    if (fields.length !== 7) {
      bad(rowNumber, "row", `Expected 7 fields, found ${fields.length}.`);
      continue;
    }
    const [dateRaw, symbolRaw, openRaw, highRaw, lowRaw, closeRaw, volumeRaw] = fields as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];

    let rowOk = true;
    const fail = (field: string, reason: string): null => {
      bad(rowNumber, field, reason);
      rowOk = false;
      return null;
    };

    const date =
      parseDateField(dateRaw) ?? fail("date", `Invalid canonical date "${dateRaw.trim()}".`);
    const symbol =
      parseSymbolField(symbolRaw) ?? fail("symbol", `Invalid symbol "${symbolRaw.trim()}".`);
    const openPaise =
      parsePaiseField(openRaw) ?? fail("open", `Invalid price "${openRaw.trim()}".`);
    const highPaise =
      parsePaiseField(highRaw) ?? fail("high", `Invalid price "${highRaw.trim()}".`);
    const lowPaise = parsePaiseField(lowRaw) ?? fail("low", `Invalid price "${lowRaw.trim()}".`);
    const closePaise =
      parsePaiseField(closeRaw) ?? fail("close", `Invalid price "${closeRaw.trim()}".`);
    const volume =
      parseVolumeField(volumeRaw) ?? fail("volume", `Invalid volume "${volumeRaw.trim()}".`);

    if (
      !rowOk ||
      date === null ||
      symbol === null ||
      openPaise === null ||
      highPaise === null ||
      lowPaise === null ||
      closePaise === null ||
      volume === null
    ) {
      continue;
    }

    if (openPaise <= 0 || highPaise <= 0 || lowPaise <= 0 || closePaise <= 0) {
      bad(rowNumber, "ohlc", "OHLC prices must each be greater than zero.");
      continue;
    }
    if (highPaise < openPaise || highPaise < closePaise || highPaise < lowPaise) {
      bad(rowNumber, "high", "High must be >= open, close, and low.");
      continue;
    }
    if (lowPaise > openPaise || lowPaise > closePaise || lowPaise > highPaise) {
      bad(rowNumber, "low", "Low must be <= open, close, and high.");
      continue;
    }

    const key = `${symbol}\u0000${date}`;
    if (previousKey !== null && key <= previousKey) {
      bad(
        rowNumber,
        "order",
        previousKey === key
          ? `Duplicate (symbol, date) "${symbol},${date}".`
          : `Rows must be strictly ascending by (symbol, date); row ${rowNumber} is out of order.`,
      );
      continue;
    }
    previousKey = key;

    bars.push({ date, symbol, openPaise, highPaise, lowPaise, closePaise, volume });
  }

  if (errors.length > 0) {
    return { status: "invalid", errors };
  }
  if (bars.length === 0) {
    return {
      status: "invalid",
      errors: [{ row: 0, field: "csv", reason: "CSV has no data rows." }],
    };
  }
  return { status: "ok", bars: freezeBars(bars) };
}

function freezeManifest(manifest: DatasetManifest): DatasetManifest {
  return Object.freeze({
    ...manifest,
    universe: Object.freeze([...manifest.universe]),
    dateRange: Object.freeze({ ...manifest.dateRange }),
  });
}

/**
 * Full dataset verification: parses the CSV, checks the manifest shape, then
 * cross-checks every manifest claim (hash, row count, date range, universe)
 * against the actual bars. Returns frozen bars and manifest, or all problems.
 */
export function validateDataset(csvText: string, manifestRaw: unknown): ValidateDatasetResult {
  const parsed = parseDatasetCsv(csvText);
  if (parsed.status === "invalid") {
    return parsed;
  }

  const shape = validateManifestShape(manifestRaw);
  if (shape.status === "invalid") {
    return shape;
  }
  const manifest = shape.manifest;
  const errors: DatasetIssue[] = [];
  const first = parsed.bars[0] as Bar;
  const last = parsed.bars[parsed.bars.length - 1] as Bar;

  let actualHash: string;
  try {
    actualHash = hashCanonicalCsv(csvText);
  } catch (error) {
    const reason = error instanceof RangeError ? error.message : "CSV is not canonical bytes.";
    return { status: "invalid", errors: [{ row: 0, field: "sha256", reason }] };
  }
  if (actualHash !== manifest.sha256) {
    errors.push({
      row: 0,
      field: "sha256",
      reason: `Manifest sha256 does not match canonical CSV bytes (actual ${actualHash}).`,
    });
  }
  if (manifest.rowCount !== parsed.bars.length) {
    errors.push({
      row: 0,
      field: "rowCount",
      reason: `Manifest rowCount ${manifest.rowCount} does not match ${parsed.bars.length} data rows.`,
    });
  }
  if (manifest.dateRange.start !== first.date || manifest.dateRange.end !== last.date) {
    errors.push({
      row: 0,
      field: "dateRange",
      reason: `Manifest range ${manifest.dateRange.start}..${manifest.dateRange.end} does not match data ${first.date}..${last.date}.`,
    });
  }
  const universeSymbol = manifest.universe[0] as string;
  const outside = parsed.bars.find((bar) => bar.symbol !== universeSymbol);
  if (outside !== undefined) {
    errors.push({
      row: 0,
      field: "universe",
      reason: `Bar ${outside.symbol},${outside.date} is outside manifest universe ["${universeSymbol}"].`,
    });
  }

  if (errors.length > 0) {
    return { status: "invalid", errors };
  }
  return { status: "ok", bars: parsed.bars, manifest: freezeManifest(manifest) };
}
