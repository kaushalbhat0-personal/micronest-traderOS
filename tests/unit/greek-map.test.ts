import { describe, expect, it } from "vitest";

import {
  analyzeGreekMap,
  arbitrageBoundsFor,
  d1d2,
  GREEK_MAP_FORMULA_ID,
  GREEK_MAP_MAX_PAISE,
  intrinsicPaiseFor,
  modelPoint,
  normalCdf,
  normalPdf,
  parseRupeesToPaise,
  roundHalfUpRupeesToPaise,
  GREEK_MAP_NORMAL_CDF_ERROR_BOUND,
  type GreekMapInput,
  type GreekMapResult,
} from "@/features/greek-map/greek-map";
import {
  greekMapFieldsSchema,
  parseDecimalToScaledInt,
  parseHandoffParams,
  toGreekMapInput,
} from "@/features/greek-map/validation";

/**
 * Provenance: every reference value below was produced from the closed-form
 * BSM itself with an independent normal-CDF implementation (Simpson-rule
 * numerical integration of erf — a different method from the engine's
 * Abramowitz–Stegun 7.1.26). Fixture B is the standard textbook ATM case:
 * S = K = 100, T = 1, r = 5%, σ = 20%, q = 0 → call ≈ 10.4506.
 *
 * Fixtures:
 * A: S=100, K=100, DTE=30, σ=20%, r=6%, q=0%
 * B: S=100, K=100, DTE=365, σ=20%, r=5%, q=0%
 * C: S=100, K=105, DTE=90, σ=25%, r=6%, q=2%
 * D: S=100, K=130, DTE=60, σ=30%, r=6%, q=0% (deep-ITM put)
 */

const A_CALL = {
  d1: 0.1146764358,
  d2: 0.0573382179,
  price: 2.5359242955,
  delta: 0.5456492039,
  gamma: 0.0691210362,
  thetaDay: -0.0464272521,
  vega1pp: 0.1136236212,
  rho1pp: 0.0427635584,
};
const A_PUT = {
  price: 2.0439876022,
  delta: -0.4543507961,
  gamma: 0.0691210362,
  thetaDay: -0.0300697622,
  vega1pp: 0.1136236212,
  rho1pp: -0.0390238909,
};
const B_CALL = {
  price: 10.4505835722,
  delta: 0.6368306512,
  gamma: 0.0187620173,
  thetaDay: -0.0175726782,
  vega1pp: 0.3752403469,
  rho1pp: 0.5323248155,
};
const B_PUT = {
  price: 5.5735260223,
  delta: -0.3631693488,
  gamma: 0.0187620173,
  thetaDay: -0.0045421381,
  vega1pp: 0.3752403469,
  rho1pp: -0.418904609,
};
const C_CALL = {
  price: 3.2923331956,
  delta: 0.3987417829,
  gamma: 0.0309826276,
  thetaDay: -0.0303547897,
  vega1pp: 0.1909888001,
  rho1pp: 0.0902018098,
};
const C_PUT = {
  price: 7.2422798585,
  delta: -0.5963388502,
  gamma: 0.0309826276,
  thetaDay: -0.0188004902,
  vega1pp: 0.1909888001,
  rho1pp: -0.1649001326,
};
const D_PUT = {
  price: 28.8193459503,
  delta: -0.9780537235,
  gamma: 0.0043061774,
  thetaDay: 0.0155060363,
  vega1pp: 0.0212359436,
  rho1pp: -0.2081502219,
};

function callInput(overrides: Partial<GreekMapInput> = {}): GreekMapInput {
  return {
    optionType: "call",
    spotPaise: 10_000,
    strikePaise: 10_000,
    dteDays: 30,
    volatilityDecimal: 0.2,
    rateDecimal: 0.06,
    dividendDecimal: 0,
    ...overrides,
  };
}

function okOf(result: GreekMapResult) {
  if (result.status !== "ok") throw new Error(`expected ok, got: ${result.reason}`);
  return result;
}

describe("normal CDF (Abramowitz–Stegun 7.1.26)", () => {
  it("returns 0.5 at zero", () => {
    expect(normalCdf(0)).toBe(0.5);
  });

  it("matches independent references within the documented bound", () => {
    const cases: Array<[number, number]> = [
      [1, 0.841344746069],
      [-1, 0.158655253931],
      [1.96, 0.975002104852],
      [2, 0.977249868052],
      [-2, 0.022750131948],
      [0.35, 0.636830651176],
      [0.15, 0.55961769237],
    ];
    for (const [x, expected] of cases) {
      expect(Math.abs(normalCdf(x) - expected)).toBeLessThanOrEqual(
        GREEK_MAP_NORMAL_CDF_ERROR_BOUND,
      );
    }
  });

  it("handles tails within the documented bound", () => {
    expect(Math.abs(normalCdf(5) - 0.999999713348)).toBeLessThanOrEqual(
      GREEK_MAP_NORMAL_CDF_ERROR_BOUND,
    );
    expect(Math.abs(normalCdf(-5) - 2.86652e-7)).toBeLessThanOrEqual(
      GREEK_MAP_NORMAL_CDF_ERROR_BOUND,
    );
  });

  it("is symmetric: N(x) + N(−x) = 1", () => {
    for (const x of [0.1, 0.5, 1, 1.96, 3]) {
      expect(Math.abs(normalCdf(x) + normalCdf(-x) - 1)).toBeLessThanOrEqual(1e-15);
    }
  });

  it("is monotone increasing", () => {
    let prev = -Infinity;
    for (let x = -4; x <= 4; x += 0.25) {
      const value = normalCdf(x);
      expect(value).toBeGreaterThan(prev);
      prev = value;
    }
  });

  it("returns NaN for non-finite input", () => {
    expect(normalCdf(NaN)).toBeNaN();
    expect(normalCdf(Infinity)).toBeNaN();
    expect(normalPdf(NaN)).toBeNaN();
  });
});

describe("d1/d2", () => {
  it("matches the reference d1/d2 for fixture A", () => {
    const dd = d1d2(100, 100, 30 / 365, 0.2, 0.06, 0);
    expect(dd).not.toBeNull();
    expect(Math.abs((dd as { d1: number }).d1 - A_CALL.d1)).toBeLessThan(1e-9);
    expect(Math.abs((dd as { d2: number }).d2 - A_CALL.d2)).toBeLessThan(1e-9);
  });

  it("holds d2 = d1 − σ√T", () => {
    const sigma = 0.25;
    const t = 90 / 365;
    const dd = d1d2(100, 105, t, sigma, 0.06, 0.02);
    expect(dd).not.toBeNull();
    if (dd === null) return;
    expect(dd.d2).toBeCloseTo(dd.d1 - sigma * Math.sqrt(t), 15);
  });

  it("returns null for degenerate inputs", () => {
    expect(d1d2(0, 100, 0.1, 0.2, 0.05, 0)).toBeNull();
    expect(d1d2(100, 0, 0.1, 0.2, 0.05, 0)).toBeNull();
    expect(d1d2(100, 100, 0, 0.2, 0.05, 0)).toBeNull();
    expect(d1d2(100, 100, 0.1, 0, 0.05, 0)).toBeNull();
    expect(d1d2(NaN, 100, 0.1, 0.2, 0.05, 0)).toBeNull();
  });
});

describe("pricing (golden)", () => {
  it("prices the ATM call of fixture A", () => {
    const point = modelPoint("call", 100, 100, 30 / 365, 0.2, 0.06, 0);
    expect(point).not.toBeNull();
    if (point === null) return;
    expect(Math.abs(point.priceRupees - A_CALL.price)).toBeLessThan(1e-4);
    expect(Math.abs(point.delta - A_CALL.delta)).toBeLessThan(1e-6);
    expect(Math.abs(point.gamma - A_CALL.gamma)).toBeLessThan(1e-9);
    expect(Math.abs(point.thetaPerDay - A_CALL.thetaDay)).toBeLessThan(1e-6);
    expect(Math.abs(point.vegaPer1pp - A_CALL.vega1pp)).toBeLessThan(1e-9);
    expect(Math.abs(point.rhoPer1pp - A_CALL.rho1pp)).toBeLessThan(1e-5);
  });

  it("prices the ATM put of fixture A", () => {
    const point = modelPoint("put", 100, 100, 30 / 365, 0.2, 0.06, 0);
    expect(point).not.toBeNull();
    if (point === null) return;
    expect(Math.abs(point.priceRupees - A_PUT.price)).toBeLessThan(1e-4);
    expect(Math.abs(point.delta - A_PUT.delta)).toBeLessThan(1e-6);
    expect(Math.abs(point.gamma - A_PUT.gamma)).toBeLessThan(1e-9);
    expect(Math.abs(point.thetaPerDay - A_PUT.thetaDay)).toBeLessThan(1e-6);
    expect(Math.abs(point.vegaPer1pp - A_PUT.vega1pp)).toBeLessThan(1e-9);
    expect(Math.abs(point.rhoPer1pp - A_PUT.rho1pp)).toBeLessThan(1e-5);
  });

  it("prices the textbook one-year ATM call near 10.4506", () => {
    const point = modelPoint("call", 100, 100, 1, 0.2, 0.05, 0);
    expect(point).not.toBeNull();
    if (point === null) return;
    expect(Math.abs(point.priceRupees - B_CALL.price)).toBeLessThan(1e-4);
    expect(Math.abs(point.delta - B_CALL.delta)).toBeLessThan(1e-6);
    expect(Math.abs(point.gamma - B_CALL.gamma)).toBeLessThan(1e-9);
    expect(Math.abs(point.thetaPerDay - B_CALL.thetaDay)).toBeLessThan(1e-6);
    expect(Math.abs(point.vegaPer1pp - B_CALL.vega1pp)).toBeLessThan(1e-9);
    expect(Math.abs(point.rhoPer1pp - B_CALL.rho1pp)).toBeLessThan(1e-5);
  });

  it("prices the textbook one-year ATM put", () => {
    const point = modelPoint("put", 100, 100, 1, 0.2, 0.05, 0);
    expect(point).not.toBeNull();
    if (point === null) return;
    expect(Math.abs(point.priceRupees - B_PUT.price)).toBeLessThan(1e-4);
    expect(Math.abs(point.delta - B_PUT.delta)).toBeLessThan(1e-6);
    expect(Math.abs(point.thetaPerDay - B_PUT.thetaDay)).toBeLessThan(1e-6);
    expect(Math.abs(point.rhoPer1pp - B_PUT.rho1pp)).toBeLessThan(1e-5);
  });

  it("prices ITM/OTM calls and puts with a dividend yield (fixture C)", () => {
    const call = modelPoint("call", 100, 105, 90 / 365, 0.25, 0.06, 0.02);
    const put = modelPoint("put", 100, 105, 90 / 365, 0.25, 0.06, 0.02);
    expect(call).not.toBeNull();
    expect(put).not.toBeNull();
    if (call === null || put === null) return;
    expect(Math.abs(call.priceRupees - C_CALL.price)).toBeLessThan(1e-4);
    expect(Math.abs(call.delta - C_CALL.delta)).toBeLessThan(1e-6);
    expect(Math.abs(call.gamma - C_CALL.gamma)).toBeLessThan(1e-9);
    expect(Math.abs(call.thetaPerDay - C_CALL.thetaDay)).toBeLessThan(1e-6);
    expect(Math.abs(call.vegaPer1pp - C_CALL.vega1pp)).toBeLessThan(1e-9);
    expect(Math.abs(call.rhoPer1pp - C_CALL.rho1pp)).toBeLessThan(1e-5);
    expect(Math.abs(put.priceRupees - C_PUT.price)).toBeLessThan(1e-4);
    expect(Math.abs(put.delta - C_PUT.delta)).toBeLessThan(1e-6);
    expect(Math.abs(put.thetaPerDay - C_PUT.thetaDay)).toBeLessThan(1e-6);
    expect(Math.abs(put.rhoPer1pp - C_PUT.rho1pp)).toBeLessThan(1e-5);
  });

  it("prices an OTM call and an ITM call from the same surface", () => {
    // Fixture C call is OTM (S=100 < K=105); an ITM call flips the strikes.
    const otm = modelPoint("call", 100, 105, 90 / 365, 0.25, 0.06, 0.02);
    const itm = modelPoint("call", 110, 105, 90 / 365, 0.25, 0.06, 0.02);
    expect(otm).not.toBeNull();
    expect(itm).not.toBeNull();
    if (otm === null || itm === null) return;
    expect(itm.priceRupees).toBeGreaterThan(otm.priceRupees);
    expect(itm.delta).toBeGreaterThan(otm.delta);
    expect(itm.delta).toBeGreaterThan(0.5);
    expect(otm.delta).toBeLessThan(0.5);
  });

  it("prices an OTM put and an ITM put from the same surface", () => {
    const otm = modelPoint("put", 110, 105, 90 / 365, 0.25, 0.06, 0.02);
    const itm = modelPoint("put", 100, 105, 90 / 365, 0.25, 0.06, 0.02);
    expect(otm).not.toBeNull();
    expect(itm).not.toBeNull();
    if (otm === null || itm === null) return;
    expect(itm.priceRupees).toBeGreaterThan(otm.priceRupees);
    expect(itm.delta).toBeLessThan(otm.delta);
    expect(itm.delta).toBeLessThan(-0.5);
  });
});

describe("Greeks conventions", () => {
  it("gives a positive call delta and a negative put delta", () => {
    const call = modelPoint("call", 100, 100, 30 / 365, 0.2, 0.06, 0);
    const put = modelPoint("put", 100, 100, 30 / 365, 0.2, 0.06, 0);
    expect(call?.delta).toBeGreaterThan(0);
    expect(put?.delta).toBeLessThan(0);
  });

  it("keeps gamma positive and identical for call and put", () => {
    const call = modelPoint("call", 100, 100, 30 / 365, 0.2, 0.06, 0);
    const put = modelPoint("put", 100, 100, 30 / 365, 0.2, 0.06, 0);
    expect(call?.gamma).toBeGreaterThan(0);
    expect(put?.gamma).toBeGreaterThan(0);
    expect(call?.gamma).toBeCloseTo(put?.gamma as number, 15);
  });

  it("keeps vega non-negative and identical for call and put", () => {
    const call = modelPoint("call", 100, 100, 30 / 365, 0.2, 0.06, 0);
    const put = modelPoint("put", 100, 100, 30 / 365, 0.2, 0.06, 0);
    expect(call?.vegaPer1pp).toBeGreaterThanOrEqual(0);
    expect(call?.vegaPer1pp).toBeCloseTo(put?.vegaPer1pp as number, 15);
  });

  it("gives a positive call rho and a negative put rho", () => {
    const call = modelPoint("call", 100, 100, 30 / 365, 0.2, 0.06, 0);
    const put = modelPoint("put", 100, 100, 30 / 365, 0.2, 0.06, 0);
    expect(call?.rhoPer1pp).toBeGreaterThan(0);
    expect(put?.rhoPer1pp).toBeLessThan(0);
  });

  it("reports a positive theta for a deep-ITM put (time decay works in its favour)", () => {
    const put = modelPoint("put", 100, 130, 60 / 365, 0.3, 0.06, 0);
    expect(put).not.toBeNull();
    if (put === null) return;
    expect(Math.abs(put.priceRupees - D_PUT.price)).toBeLessThan(1e-4);
    expect(put.thetaPerDay).toBeGreaterThan(0);
    expect(Math.abs(put.thetaPerDay - D_PUT.thetaDay)).toBeLessThan(1e-6);
  });

  it("applies the −∂V/∂T convention: theta is per calendar day via ÷ 365", () => {
    const point = modelPoint("call", 100, 100, 30 / 365, 0.2, 0.06, 0);
    expect(point).not.toBeNull();
    if (point === null) return;
    // −∂V/∂T as a yearly rate, then ÷ 365: matches the reference day rate.
    expect(Math.abs(point.thetaPerDay - A_CALL.thetaDay)).toBeLessThan(1e-6);
    expect(point.thetaPerDay * 365).toBeLessThan(0);
  });
});

describe("model properties", () => {
  it("holds put-call parity: C − P = S·e^−qT − K·e^−rT", () => {
    const t = 90 / 365;
    const call = modelPoint("call", 100, 105, t, 0.25, 0.06, 0.02);
    const put = modelPoint("put", 100, 105, t, 0.25, 0.06, 0.02);
    expect(call).not.toBeNull();
    expect(put).not.toBeNull();
    if (call === null || put === null) return;
    const parity = 100 * Math.exp(-0.02 * t) - 105 * Math.exp(-0.06 * t);
    expect(call.priceRupees - put.priceRupees).toBeCloseTo(parity, 8);
  });

  it("reduces cleanly when q = 0: call delta is exactly N(d1)", () => {
    const point = modelPoint("call", 100, 100, 30 / 365, 0.2, 0.06, 0);
    const dd = d1d2(100, 100, 30 / 365, 0.2, 0.06, 0);
    expect(point).not.toBeNull();
    expect(dd).not.toBeNull();
    if (point === null || dd === null) return;
    expect(Math.abs(point.delta - normalCdf(dd.d1))).toBeLessThan(1e-15);
  });

  it("is deterministic across evaluations", () => {
    const first = analyzeGreekMap(callInput());
    const second = analyzeGreekMap(callInput());
    expect(first).toEqual(second);
  });

  it("rejects an unknown option type", () => {
    const result = analyzeGreekMap({ ...callInput(), optionType: "straddle" as "call" });
    expect(result.status).toBe("invalid");
  });
});

describe("analytic vs finite-difference cross-checks", () => {
  // Central differences on the engine's own price surface. Tolerances are
  // relative (1e-4); the step sizes below are the standard trade-off between
  // truncation and floating-point cancellation for each variable.
  const S = 100;
  const K = 100;
  const T = 30 / 365;
  const SIGMA = 0.2;
  const R = 0.06;
  const Q = 0;

  function priceOf(type: "call" | "put", s: number, t: number, sigma: number, r: number): number {
    const point = modelPoint(type, s, K, t, sigma, r, Q);
    if (point === null) throw new Error("finite-difference surface failed");
    return point.priceRupees;
  }

  it.each(["call", "put"] as const)("delta matches the price slope in S (%s)", (type) => {
    const analytic = modelPoint(type, S, K, T, SIGMA, R, Q);
    expect(analytic).not.toBeNull();
    if (analytic === null) return;
    const h = 0.01;
    const fd = (priceOf(type, S + h, T, SIGMA, R) - priceOf(type, S - h, T, SIGMA, R)) / (2 * h);
    const denom = Math.max(Math.abs(analytic.delta), 1e-8);
    expect(Math.abs(fd - analytic.delta) / denom).toBeLessThan(1e-4);
  });

  it.each(["call", "put"] as const)("gamma matches the price curvature in S (%s)", (type) => {
    const analytic = modelPoint(type, S, K, T, SIGMA, R, Q);
    expect(analytic).not.toBeNull();
    if (analytic === null) return;
    // h = 0.01 (one paise-scale step): truncation falls with h² while the
    // cancelled numerator stays near 1e-13, far under the curvature ~0.07.
    // Absolute tolerance 1e-4 here (not relative): an exact-CDF control
    // converges to 3e-7 relative, so the residual is the engine's documented
    // 1.5e-7 CDF bound propagating through the price surface — a property of
    // the check, not of the analytic gamma, which the golden tests pin to 1e-9.
    const h = 0.01;
    const fd =
      (priceOf(type, S + h, T, SIGMA, R) -
        2 * priceOf(type, S, T, SIGMA, R) +
        priceOf(type, S - h, T, SIGMA, R)) /
      (h * h);
    expect(Math.abs(fd - analytic.gamma)).toBeLessThan(1e-4);
  });

  it.each(["call", "put"] as const)("vega matches the price slope in σ (%s)", (type) => {
    const analytic = modelPoint(type, S, K, T, SIGMA, R, Q);
    expect(analytic).not.toBeNull();
    if (analytic === null) return;
    const h = 0.0005;
    const fd =
      (priceOf(type, S, T, SIGMA + h, R) - priceOf(type, S, T, SIGMA - h, R)) / (2 * h) / 100;
    const denom = Math.max(Math.abs(analytic.vegaPer1pp), 1e-8);
    expect(Math.abs(fd - analytic.vegaPer1pp) / denom).toBeLessThan(1e-4);
  });

  it.each(["call", "put"] as const)("rho matches the price slope in r (%s)", (type) => {
    const analytic = modelPoint(type, S, K, T, SIGMA, R, Q);
    expect(analytic).not.toBeNull();
    if (analytic === null) return;
    const h = 0.0005;
    const fd =
      (priceOf(type, S, T, SIGMA, R + h) - priceOf(type, S, T, SIGMA, R - h)) / (2 * h) / 100;
    const denom = Math.max(Math.abs(analytic.rhoPer1pp), 1e-8);
    expect(Math.abs(fd - analytic.rhoPer1pp) / denom).toBeLessThan(1e-4);
  });

  it.each(["call", "put"] as const)("theta matches −∂V/∂T (%s)", (type) => {
    const analytic = modelPoint(type, S, K, T, SIGMA, R, Q);
    expect(analytic).not.toBeNull();
    if (analytic === null) return;
    // A one-day central step in T; time differences cancel less cleanly than
    // space differences, so the check uses an absolute tolerance of half a
    // paise per day, documented here.
    const h = 1 / 365;
    const fdPerDay =
      -((priceOf(type, S, T + h, SIGMA, R) - priceOf(type, S, T - h, SIGMA, R)) / (2 * h)) / 365;
    expect(Math.abs(fdPerDay - analytic.thetaPerDay)).toBeLessThan(0.005);
  });
});

describe("numerical policy", () => {
  it("accepts the minimum DTE of 1 day", () => {
    const result = analyzeGreekMap(callInput({ dteDays: 1 }));
    expect(result.status).toBe("ok");
  });

  it("accepts the maximum DTE of 730 days", () => {
    const result = analyzeGreekMap(callInput({ dteDays: 730 }));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.timeScenarios).toHaveLength(3);
  });

  it("blocks DTE under 1 day", () => {
    expect(analyzeGreekMap(callInput({ dteDays: 0.99 })).status).toBe("invalid");
  });

  it("blocks DTE above 730 days", () => {
    expect(analyzeGreekMap(callInput({ dteDays: 731 })).status).toBe("invalid");
  });

  it("accepts the minimum volatility of 0.1%", () => {
    expect(analyzeGreekMap(callInput({ volatilityDecimal: 0.001 })).status).toBe("ok");
  });

  it("accepts the maximum volatility of 500%", () => {
    expect(analyzeGreekMap(callInput({ volatilityDecimal: 5 })).status).toBe("ok");
  });

  it("blocks volatility above 500%", () => {
    expect(analyzeGreekMap(callInput({ volatilityDecimal: 5.0001 })).status).toBe("invalid");
  });

  it("accepts rate and dividend at 0% and at their caps", () => {
    expect(analyzeGreekMap(callInput({ rateDecimal: 0, dividendDecimal: 0 })).status).toBe("ok");
    expect(analyzeGreekMap(callInput({ rateDecimal: 0.2, dividendDecimal: 0.15 })).status).toBe(
      "ok",
    );
  });

  it("blocks rate above 20% and dividend above 15%", () => {
    expect(analyzeGreekMap(callInput({ rateDecimal: 0.2001 })).status).toBe("invalid");
    expect(analyzeGreekMap(callInput({ dividendDecimal: 0.1501 })).status).toBe("invalid");
  });

  it("handles cap-scale spot and strike (₹100 crore)", () => {
    const result = analyzeGreekMap(
      callInput({ spotPaise: GREEK_MAP_MAX_PAISE, strikePaise: GREEK_MAP_MAX_PAISE }),
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(Number.isFinite(result.base.pricePaise)).toBe(true);
  });

  it("blocks non-finite intermediates instead of leaking NaN", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(analyzeGreekMap(callInput({ volatilityDecimal: bad })).status).toBe("invalid");
      expect(analyzeGreekMap(callInput({ dteDays: bad })).status).toBe("invalid");
    }
    const result = analyzeGreekMap(callInput({ volatilityDecimal: NaN }));
    if (result.status !== "invalid") throw new Error("expected invalid");
    expect(result.code).toBe("invalid_input");
  });

  it("rounds the model value half-up to paise for display", () => {
    // Fixture A call: ₹2.5359242955 → 254 paise.
    const result = analyzeGreekMap(callInput());
    const ok = okOf(result);
    expect(ok.base.pricePaise).toBe(254);
    expect(roundHalfUpRupeesToPaise(2.535)).toBe(254);
    expect(roundHalfUpRupeesToPaise(2.534)).toBe(253);
    expect(roundHalfUpRupeesToPaise(NaN)).toBeNull();
    expect(roundHalfUpRupeesToPaise(-0.000001)).toBe(0);
  });
});

describe("intrinsic value and premium handling", () => {
  it("computes intrinsic value in exact integer paise", () => {
    expect(intrinsicPaiseFor("call", 10_000, 9_500)).toBe(500);
    expect(intrinsicPaiseFor("call", 9_500, 10_000)).toBe(0);
    expect(intrinsicPaiseFor("put", 10_000, 10_500)).toBe(500);
    expect(intrinsicPaiseFor("put", 10_500, 10_000)).toBe(0);
  });

  it("reports no comparison when the premium is absent", () => {
    const ok = okOf(analyzeGreekMap(callInput()));
    expect(ok.comparison).toBeNull();
    expect(ok.warnings).toEqual([]);
  });

  it("compares a valid premium arithmetically", () => {
    // Base call value is 254 paise; a 300-paise premium differs by +46.
    const ok = okOf(analyzeGreekMap(callInput({ premiumPaise: 300 })));
    expect(ok.status).toBe("ok");
    expect(ok.comparison).toEqual({
      yourPremiumPaise: 300,
      modelValuePaise: 254,
      differencePaise: 46,
    });
  });

  it("warns but still calculates when the premium is under intrinsic value", () => {
    // ITM call: spot ₹110, strike ₹100 → intrinsic ₹10; premium ₹5 sits under it.
    const ok = okOf(
      analyzeGreekMap(callInput({ spotPaise: 11_000, strikePaise: 10_000, premiumPaise: 500 })),
    );
    expect(ok.comparison).not.toBeNull();
    expect(ok.warnings.some((w) => w.code === "premium_under_intrinsic")).toBe(true);
  });

  it("warns when the premium is outside the European arbitrage bounds", () => {
    const bounds = arbitrageBoundsFor("call", 100, 100, 30 / 365, 0.06, 0);
    expect(bounds).not.toBeNull();
    if (bounds === null) return;
    // A premium above the discounted spot cannot be reproduced under BSM.
    const over = Math.ceil((bounds.upperRupees + 1) * 100);
    const ok = okOf(analyzeGreekMap(callInput({ premiumPaise: over })));
    expect(ok.warnings.some((w) => w.code === "outside_arbitrage_bounds")).toBe(true);
    expect(ok.warnings.find((w) => w.code === "outside_arbitrage_bounds")?.message).toContain(
      "Premium is outside the European arbitrage bounds for the supplied inputs.",
    );
  });

  it("rejects a zero premium at the validation boundary", () => {
    const parsed = greekMapFieldsSchema.safeParse({
      optionType: "call",
      spot: "100",
      strike: "100",
      dte: "30",
      volatility: "20",
      rate: "6",
      dividend: "0",
      premium: "0",
      expiryLabel: "",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("scenarios", () => {
  it("produces five spot scenarios in fixed order with the base row marked", () => {
    const ok = okOf(analyzeGreekMap(callInput()));
    expect(ok.spotScenarios.map((row) => row.scenarioPct)).toEqual([-10, -5, 0, 5, 10]);
    const base = ok.spotScenarios.find((row) => row.isBase);
    expect(base?.scenarioPct).toBe(0);
    expect(base?.pricePaise).toBe(ok.base.pricePaise);
    expect(base?.delta).toBe(ok.base.delta);
    // Spot falls → call value falls; spot rises → call value rises.
    const prices = ok.spotScenarios.map((row) => row.pricePaise);
    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sorted);
  });

  it("mirrors the base row for puts with falling values as spot rises", () => {
    const ok = okOf(analyzeGreekMap(callInput({ optionType: "put" })));
    const prices = ok.spotScenarios.map((row) => row.pricePaise);
    const sorted = [...prices].sort((a, b) => b - a);
    expect(prices).toEqual(sorted);
  });

  it("holds K, DTE and the rates constant across spot rows", () => {
    const input = callInput({ dteDays: 45, volatilityDecimal: 0.25 });
    const ok = okOf(analyzeGreekMap(input));
    expect(ok.spotScenarios).toHaveLength(5);
    // The 0% row replays the base point exactly.
    const base = ok.spotScenarios[2];
    expect(base?.isBase).toBe(true);
    expect(base?.spotPaise).toBe(input.spotPaise);
  });

  it("produces −1/−3/−7 day time rows with model value and theta", () => {
    const ok = okOf(analyzeGreekMap(callInput({ dteDays: 30 })));
    expect(ok.timeScenarios).toHaveLength(3);
    for (const row of ok.timeScenarios) {
      if (!("omitted" in row) || row.omitted !== true) {
        expect(Number.isFinite(row.pricePaise)).toBe(true);
        expect(Number.isFinite(row.thetaPerDay)).toBe(true);
      } else {
        throw new Error("no row should be omitted at DTE 30");
      }
    }
    expect(ok.timeScenarios.map((row) => row.minusDays)).toEqual([1, 3, 7]);
  });

  it("omits time rows that would fall under the 1-day floor instead of clamping", () => {
    const ok = okOf(analyzeGreekMap(callInput({ dteDays: 3 })));
    const omitted = ok.timeScenarios.filter(
      (row): row is { minusDays: number; dteDays: number; omitted: true } =>
        "omitted" in row && row.omitted === true,
    );
    // −1 → DTE 2 (kept); −3 → DTE 0 (omitted); −7 → negative (omitted).
    expect(ok.timeScenarios).toHaveLength(3);
    expect(omitted.map((row) => row.minusDays)).toEqual([3, 7]);
  });

  it("omits every time row at the 1-day floor", () => {
    const ok = okOf(analyzeGreekMap(callInput({ dteDays: 1 })));
    expect(ok.timeScenarios.every((row) => "omitted" in row && row.omitted === true)).toBe(true);
  });
});

describe("money parsing", () => {
  it("converts exact decimals to integer paise", () => {
    expect(parseRupeesToPaise("123.45")).toBe(12_345);
    expect(parseRupeesToPaise("100")).toBe(10_000);
    expect(parseRupeesToPaise("1,00,000")).toBe(10_000_000);
  });

  it("rejects values that lose precision or are not plain decimals", () => {
    expect(parseRupeesToPaise("12.345")).toBeNull();
    expect(parseRupeesToPaise("abc")).toBeNull();
    expect(parseRupeesToPaise("")).toBeNull();
    expect(parseRupeesToPaise("-10")).toBeNull();
  });
});

describe("validation boundary", () => {
  function validFields(overrides: Record<string, string> = {}) {
    return {
      optionType: "call",
      spot: "100",
      strike: "100",
      dte: "30",
      volatility: "20",
      rate: "6",
      dividend: "0",
      premium: "",
      expiryLabel: "",
      ...overrides,
    };
  }

  it("parses a complete valid submission", () => {
    const parsed = greekMapFieldsSchema.safeParse(validFields({ premium: "3" }));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(toGreekMapInput(parsed.data)).toEqual({
      optionType: "call",
      spotPaise: 10_000,
      strikePaise: 10_000,
      dteDays: 30,
      volatilityDecimal: 0.2,
      rateDecimal: 0.06,
      dividendDecimal: 0,
      premiumPaise: 300,
    });
  });

  it("has no defaults: volatility, rate and dividend are all required", () => {
    for (const key of ["volatility", "rate", "dividend"] as const) {
      expect(greekMapFieldsSchema.safeParse(validFields({ [key]: "" })).success).toBe(false);
    }
  });

  it("accepts an explicitly typed zero for rate and dividend", () => {
    const parsed = greekMapFieldsSchema.safeParse(validFields({ rate: "0", dividend: "0" }));
    expect(parsed.success).toBe(true);
  });

  it("rejects DTE outside 1–730 and beyond 2 decimals", () => {
    expect(greekMapFieldsSchema.safeParse(validFields({ dte: "0.99" })).success).toBe(false);
    expect(greekMapFieldsSchema.safeParse(validFields({ dte: "731" })).success).toBe(false);
    expect(greekMapFieldsSchema.safeParse(validFields({ dte: "30.125" })).success).toBe(false);
    expect(greekMapFieldsSchema.safeParse(validFields({ dte: "1" })).success).toBe(true);
    expect(greekMapFieldsSchema.safeParse(validFields({ dte: "730" })).success).toBe(true);
    expect(greekMapFieldsSchema.safeParse(validFields({ dte: "30.5" })).success).toBe(true);
  });

  it("decides DTE on the exact string, not on binary float parsing", () => {
    // "0.29" parses in binary float as 0.28999…; the boundary still sees 29/100.
    expect(parseDecimalToScaledInt("0.29", 2)).toBe(29);
    expect(parseDecimalToScaledInt("30.50", 2)).toBe(3050);
    expect(parseDecimalToScaledInt("30.501", 2)).toBeNull();
    expect(parseDecimalToScaledInt("abc", 2)).toBeNull();
    expect(parseDecimalToScaledInt("", 2)).toBeNull();
  });

  it("enforces the 0.1%–500% volatility boundary exactly", () => {
    expect(greekMapFieldsSchema.safeParse(validFields({ volatility: "0.1" })).success).toBe(true);
    expect(greekMapFieldsSchema.safeParse(validFields({ volatility: "0.09" })).success).toBe(false);
    expect(greekMapFieldsSchema.safeParse(validFields({ volatility: "500" })).success).toBe(true);
    expect(greekMapFieldsSchema.safeParse(validFields({ volatility: "500.0001" })).success).toBe(
      false,
    );
  });

  it("enforces the 0%–20% rate and 0%–15% dividend boundaries exactly", () => {
    expect(greekMapFieldsSchema.safeParse(validFields({ rate: "20" })).success).toBe(true);
    expect(greekMapFieldsSchema.safeParse(validFields({ rate: "20.0001" })).success).toBe(false);
    expect(greekMapFieldsSchema.safeParse(validFields({ dividend: "15" })).success).toBe(true);
    expect(greekMapFieldsSchema.safeParse(validFields({ dividend: "15.0001" })).success).toBe(
      false,
    );
  });

  it("rejects money above ₹100 crore and an over-long expiry label", () => {
    expect(greekMapFieldsSchema.safeParse(validFields({ spot: "1000000001" })).success).toBe(false);
    expect(
      greekMapFieldsSchema.safeParse(validFields({ expiryLabel: "x".repeat(31) })).success,
    ).toBe(false);
    expect(
      greekMapFieldsSchema.safeParse(validFields({ expiryLabel: "NIFTY 30 OCT" })).success,
    ).toBe(true);
  });

  it("carries the expiry label through untouched", () => {
    const result = analyzeGreekMap(callInput({ expiryLabel: "NIFTY 30 OCT" }));
    const ok = okOf(result);
    expect(ok.inputs.expiryLabel).toBe("NIFTY 30 OCT");
  });
});

describe("handoff parser", () => {
  it("accepts the whitelisted type, strike and spot", () => {
    expect(parseHandoffParams({ type: "put", strike: "105", spot: "100" })).toEqual({
      optionType: "put",
      spot: "100",
      strike: "105",
    });
  });

  it("ignores unknown keys and drops malformed values", () => {
    expect(
      parseHandoffParams({
        type: "call",
        spot: "100",
        strike: "95",
        premium: "8",
        dte: "30",
        volatility: "20",
        rate: "6",
        dividend: "1",
        direction: "long",
        foo: "bar",
      }),
    ).toEqual({ optionType: "call", spot: "100", strike: "95" });
    expect(parseHandoffParams({ type: "straddle", spot: "abc", strike: "0" })).toEqual({});
    expect(parseHandoffParams({})).toEqual({});
  });

  it("carries the formula id on every result", () => {
    const ok = okOf(analyzeGreekMap(callInput()));
    expect(ok.formulaId).toBe(GREEK_MAP_FORMULA_ID);
    const invalid = analyzeGreekMap(callInput({ dteDays: 0 }));
    if (invalid.status !== "invalid") throw new Error("expected invalid");
    expect(invalid.formulaId).toBe(GREEK_MAP_FORMULA_ID);
    expect(invalid.code).toBe("invalid_input");
  });
});
