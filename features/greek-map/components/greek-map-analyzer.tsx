"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import {
  analyzeGreekMap,
  GREEK_MAP_FORMULA_ID,
  type GreekMapResult,
} from "@/features/greek-map/greek-map";
import {
  greekMapFieldsSchema,
  toGreekMapInput,
  type GreekMapHandoffFields,
  type GreekMapRawFields,
} from "@/features/greek-map/validation";

const inrExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display-only formatting at the UI edge; the engine only sees integer paise and decimals. */
function formatPaise(paise: number): string {
  return inrExact.format(paise / 100);
}

function formatSignedPaise(paise: number): string {
  const sign = paise > 0 ? "+" : "";
  return `${sign}${formatPaise(paise)}`;
}

/** Fixed-decimal Greek formatting. Normalises −0 so signs are never implied by rounding dust. */
function formatDecimal(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}

const EMPTY_FIELDS: GreekMapRawFields = {
  optionType: "call",
  spot: "",
  strike: "",
  dte: "",
  volatility: "",
  rate: "",
  dividend: "",
  premium: "",
  expiryLabel: "",
};

const INPUT_CLASS =
  "tnum min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-ink placeholder:text-ink-muted/70";
const LABEL_CLASS = "type-label block text-ink";
const HINT_CLASS = "type-caption mt-1 text-ink-muted";
const ERROR_CLASS = "type-caption mt-1 font-medium text-danger";

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className={ERROR_CLASS}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={HINT_CLASS}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ReceiptRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="type-helper text-ink-muted">{term}</dt>
      <dd className="tnum type-helper shrink-0 text-right text-ink">{value}</dd>
    </div>
  );
}

function GreekRow({ term, value, unit }: { term: string; value: string; unit: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="type-helper text-ink-muted">{term}</dt>
      <dd className="tnum type-helper shrink-0 text-right text-ink">
        {value} <span className="text-ink-muted">{unit}</span>
      </dd>
    </div>
  );
}

export function GreekMapAnalyzer({
  initialFields = {},
}: {
  /** Prefill of type/strike/spot carried from StrikeLens. Always editable, never trusted. */
  initialFields?: GreekMapHandoffFields;
}) {
  const [fields, setFields] = useState<GreekMapRawFields>({
    ...EMPTY_FIELDS,
    ...(initialFields.optionType !== undefined ? { optionType: initialFields.optionType } : {}),
    ...(initialFields.spot !== undefined ? { spot: initialFields.spot } : {}),
    ...(initialFields.strike !== undefined ? { strike: initialFields.strike } : {}),
  });
  const [errors, setErrors] = useState<Partial<Record<keyof GreekMapRawFields, string>>>({});
  const [result, setResult] = useState<GreekMapResult | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const hasHandoff =
    initialFields.optionType !== undefined ||
    initialFields.spot !== undefined ||
    initialFields.strike !== undefined;

  function setField(name: keyof GreekMapRawFields, value: string) {
    setFields((prev) => ({ ...prev, [name]: value }));
    // The model belongs to one option type: switching CE/PE clears a stale
    // result and its announcement so neither can be read under the wrong type.
    if (name === "optionType") {
      setResult(null);
      setAnnouncement("");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = greekMapFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof GreekMapRawFields, string>> = {};
      for (const issue of parsed.error.issues) {
        const head = issue.path[0] as keyof GreekMapRawFields | undefined;
        if (head !== undefined && nextErrors[head] === undefined) nextErrors[head] = issue.message;
      }
      setErrors(nextErrors);
      setResult(null);
      setAnnouncement("Check the highlighted fields and try again.");
      return;
    }
    setErrors({});
    const analysed = analyzeGreekMap(toGreekMapInput(parsed.data));
    setResult(analysed);
    setAnnouncement(
      analysed.status === "ok"
        ? `Model calculated. Model value ${formatPaise(analysed.base.pricePaise)}.`
        : `${analysed.reason}`,
    );
  }

  const describe = (id: string, hint: boolean, hasError: boolean) =>
    hasError ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const optionLabel = fields.optionType === "call" ? "CE" : "PE";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card as="section" aria-labelledby="greek-map-inputs-heading">
        <h2 id="greek-map-inputs-heading" className="type-section">
          Your inputs
        </h2>
        {hasHandoff ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Values carried forward</Badge>
            <p className="type-caption text-ink-muted">
              Review or change them. GreekMap calculates from what is in this form.
            </p>
          </div>
        ) : null}
        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-6">
          <div>
            <span id="gm-type-label" className={LABEL_CLASS}>
              Option type
            </span>
            <div
              role="radiogroup"
              aria-labelledby="gm-type-label"
              className="mt-1.5 grid grid-cols-2 gap-2"
            >
              {(
                [
                  { value: "call", label: "CE (Call)" },
                  { value: "put", label: "PE (Put)" },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={`type-label inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 transition-colors ${
                    fields.optionType === option.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-line bg-surface text-ink-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="optionType"
                    value={option.value}
                    checked={fields.optionType === option.value}
                    onChange={() => setField("optionType", option.value)}
                    className="size-4 accent-[#064e3b]"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {errors.optionType ? (
              <p id="gm-type-error" className={ERROR_CLASS}>
                {errors.optionType}
              </p>
            ) : (
              <p id="gm-type-hint" className={HINT_CLASS}>
                One option at a time.
              </p>
            )}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              id="gm-spot"
              label="Spot (₹)"
              hint="The underlying price you want to model."
              error={errors.spot}
            >
              <input
                id="gm-spot"
                name="spot"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="100"
                value={fields.spot}
                onChange={(event) => setField("spot", event.target.value)}
                aria-invalid={Boolean(errors.spot)}
                aria-describedby={describe("gm-spot", true, Boolean(errors.spot))}
                className={`${INPUT_CLASS} mt-1.5 ${errors.spot ? "border-danger" : ""}`}
              />
            </Field>

            <Field
              id="gm-strike"
              label="Strike (₹)"
              hint="The strike you want to model."
              error={errors.strike}
            >
              <input
                id="gm-strike"
                name="strike"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="100"
                value={fields.strike}
                onChange={(event) => setField("strike", event.target.value)}
                aria-invalid={Boolean(errors.strike)}
                aria-describedby={describe("gm-strike", true, Boolean(errors.strike))}
                className={`${INPUT_CLASS} mt-1.5 ${errors.strike ? "border-danger" : ""}`}
              />
            </Field>
          </div>

          <Field
            id="gm-dte"
            label="Days to expiry"
            hint="Calendar days, 1–730. Time enters the model as DTE ÷ 365."
            error={errors.dte}
          >
            <input
              id="gm-dte"
              name="dte"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="30"
              value={fields.dte}
              onChange={(event) => setField("dte", event.target.value)}
              aria-invalid={Boolean(errors.dte)}
              aria-describedby={describe("gm-dte", true, Boolean(errors.dte))}
              className={`${INPUT_CLASS} mt-1.5 ${errors.dte ? "border-danger" : ""}`}
            />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              id="gm-volatility"
              label="Volatility (% per year)"
              hint="Annual volatility you type in, in percent. 20 means 20%."
              error={errors.volatility}
            >
              <input
                id="gm-volatility"
                name="volatility"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="20"
                value={fields.volatility}
                onChange={(event) => setField("volatility", event.target.value)}
                aria-invalid={Boolean(errors.volatility)}
                aria-describedby={describe("gm-volatility", true, Boolean(errors.volatility))}
                className={`${INPUT_CLASS} mt-1.5 ${errors.volatility ? "border-danger" : ""}`}
              />
            </Field>

            <Field
              id="gm-rate"
              label="Risk-free rate (% per year)"
              hint="Annual rate you type in. Type 0 when the assumption is zero."
              error={errors.rate}
            >
              <input
                id="gm-rate"
                name="rate"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="6"
                value={fields.rate}
                onChange={(event) => setField("rate", event.target.value)}
                aria-invalid={Boolean(errors.rate)}
                aria-describedby={describe("gm-rate", true, Boolean(errors.rate))}
                className={`${INPUT_CLASS} mt-1.5 ${errors.rate ? "border-danger" : ""}`}
              />
            </Field>
          </div>

          <Field
            id="gm-dividend"
            label="Dividend yield (% per year)"
            hint="Continuous annual yield you type in. Type 0 when the assumption is zero."
            error={errors.dividend}
          >
            <input
              id="gm-dividend"
              name="dividend"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={fields.dividend}
              onChange={(event) => setField("dividend", event.target.value)}
              aria-invalid={Boolean(errors.dividend)}
              aria-describedby={describe("gm-dividend", true, Boolean(errors.dividend))}
              className={`${INPUT_CLASS} mt-1.5 ${errors.dividend ? "border-danger" : ""}`}
            />
          </Field>

          <Field
            id="gm-premium"
            label="Your premium (₹, optional)"
            hint="Used only for arithmetic comparison with the model value."
            error={errors.premium}
          >
            <input
              id="gm-premium"
              name="premium"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Optional"
              value={fields.premium}
              onChange={(event) => setField("premium", event.target.value)}
              aria-invalid={Boolean(errors.premium)}
              aria-describedby={describe("gm-premium", true, Boolean(errors.premium))}
              className={`${INPUT_CLASS} mt-1.5 ${errors.premium ? "border-danger" : ""}`}
            />
          </Field>

          <Field
            id="gm-expiry"
            label="Expiry label (optional)"
            hint="Display only, e.g. NIFTY 30 OCT. Never enters a calculation."
            error={errors.expiryLabel}
          >
            <input
              id="gm-expiry"
              name="expiryLabel"
              type="text"
              autoComplete="off"
              placeholder="Optional"
              value={fields.expiryLabel}
              onChange={(event) => setField("expiryLabel", event.target.value)}
              aria-invalid={Boolean(errors.expiryLabel)}
              aria-describedby={describe("gm-expiry", true, Boolean(errors.expiryLabel))}
              className={`${INPUT_CLASS} mt-1.5 ${errors.expiryLabel ? "border-danger" : ""}`}
            />
          </Field>

          <Button type="submit" className="w-full sm:w-auto">
            Calculate model
          </Button>
        </form>
      </Card>

      <section aria-labelledby="greek-map-result-heading" aria-live="polite">
        <h2 id="greek-map-result-heading" className="sr-only">
          Result
        </h2>
        <p className="sr-only">{announcement}</p>
        {result === null ? (
          <Card>
            <h3 className="type-subtitle">Your model result will appear here</h3>
            <p className="type-helper mt-1.5 text-ink-muted">
              Type one option&apos;s inputs to see its model price and Greeks, plus fixed spot and
              time scenarios. GreekMap illustrates your assumptions — it never judges a strike or a
              strategy.
            </p>
          </Card>
        ) : result.status === "invalid" ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="danger">Cannot calculate</Badge>
              <span className="type-caption text-ink-muted">{GREEK_MAP_FORMULA_ID}</span>
            </div>
            <p className="type-body mt-3">{result.reason}</p>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone="ok">
                  Model calculated · {formatPaise(result.inputs.strikePaise)} {optionLabel}
                </Badge>
                <span className="type-caption text-ink-muted">{GREEK_MAP_FORMULA_ID}</span>
              </div>

              <div className="mt-4">
                <p className="type-eyebrow text-ink-muted">Model value</p>
                <p className="type-title tnum mt-1">{formatPaise(result.base.pricePaise)}</p>
              </div>

              <dl className="mt-3 divide-y divide-line border-t border-line">
                <GreekRow term="Delta" value={formatDecimal(result.base.delta, 4)} unit="per ₹1" />
                <GreekRow term="Gamma" value={formatDecimal(result.base.gamma, 6)} unit="per ₹1" />
                <GreekRow
                  term="Theta"
                  value={formatDecimal(result.base.thetaPerDay, 2)}
                  unit="₹ / calendar day"
                />
                <GreekRow
                  term="Vega"
                  value={formatDecimal(result.base.vegaPer1pp, 2)}
                  unit="₹ / 1pp IV"
                />
                <GreekRow
                  term="Rho"
                  value={formatDecimal(result.base.rhoPer1pp, 2)}
                  unit="₹ / 1pp rate"
                />
              </dl>
              <p className="type-caption mt-2 text-ink-muted">
                Theta: model price sensitivity to one calendar day of time decay, holding the other
                model inputs constant.
              </p>

              {result.warnings.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {result.warnings.map((warning) => (
                    <div
                      key={warning.code}
                      role="alert"
                      className="rounded-lg border border-warn/30 bg-warn/5 p-3"
                    >
                      <p className="type-helper font-medium text-warn-strong">{warning.message}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {result.comparison !== null ? (
                <div className="mt-4 rounded-lg border border-line bg-surface-muted/40 p-4">
                  <h3 className="type-subtitle">Model comparison</h3>
                  <dl className="mt-2 divide-y divide-line border-t border-line">
                    <ReceiptRow
                      term="Your premium"
                      value={formatPaise(result.comparison.yourPremiumPaise)}
                    />
                    <ReceiptRow
                      term="Model value"
                      value={formatPaise(result.comparison.modelValuePaise)}
                    />
                    <ReceiptRow
                      term="Arithmetic difference"
                      value={formatSignedPaise(result.comparison.differencePaise)}
                    />
                  </dl>
                  <p className="type-caption mt-2 text-ink-muted">
                    Arithmetic difference only — not a mispricing signal.
                  </p>
                </div>
              ) : null}

              <details className="mt-4 rounded-lg border border-line bg-surface-muted/50 px-4 py-2">
                <summary className="type-label inline-flex min-h-11 cursor-pointer items-center text-ink">
                  Calculation receipt · {GREEK_MAP_FORMULA_ID}
                </summary>
                <dl className="divide-y divide-line border-t border-line pb-2">
                  <ReceiptRow
                    term="MicroNest model"
                    value="Black-Scholes-Merton with continuous dividend yield"
                  />
                  <ReceiptRow term="Exercise" value="European (exercise at expiry only)" />
                  <ReceiptRow
                    term="Option type"
                    value={result.inputs.optionType === "call" ? "CE (Call)" : "PE (Put)"}
                  />
                  <ReceiptRow term="Spot" value={formatPaise(result.inputs.spotPaise)} />
                  <ReceiptRow term="Strike" value={formatPaise(result.inputs.strikePaise)} />
                  <ReceiptRow term="Call price" value="S·e^(−qT)·N(d1) − K·e^(−rT)·N(d2)" />
                  <ReceiptRow term="Put price" value="K·e^(−rT)·N(−d2) − S·e^(−qT)·N(−d1)" />
                  <ReceiptRow
                    term="d1"
                    value="d1 = [ln(S/K) + (r−q+σ²/2)T] / (σ√T); d2 = d1 − σ√T"
                  />
                  <ReceiptRow term="Time" value="T = DTE ÷ 365, continuous compounding" />
                  <ReceiptRow
                    term="Held constant"
                    value="σ, r and q stay constant across the calculation"
                  />
                  <ReceiptRow
                    term="Distribution"
                    value="Lognormal prices (geometric Brownian motion)"
                  />
                  <ReceiptRow
                    term="Frictions"
                    value="No costs, taxes, spreads or liquidity limits"
                  />
                  <ReceiptRow
                    term="Delta"
                    value="Call e^(−qT)·N(d1); put e^(−qT)·(N(d1)−1); per ₹1"
                  />
                  <ReceiptRow term="Gamma" value="Same for call and put; per ₹1" />
                  <ReceiptRow term="Theta" value="−∂V/∂T in ₹ per calendar day (÷ 365)" />
                  <ReceiptRow term="Vega" value="Per 1pp IV change (÷ 100)" />
                  <ReceiptRow term="Rho" value="Per 1pp rate change (÷ 100)" />
                  <ReceiptRow
                    term="Spot scenarios"
                    value="−10/−5/0/+5/+10% on S; K, DTE, σ, r, q constant"
                  />
                  <ReceiptRow
                    term="Time scenarios"
                    value="−1/−3/−7 days on DTE; under the 1-day floor rows are omitted"
                  />
                  {result.inputs.expiryLabel !== undefined ? (
                    <ReceiptRow term="Expiry label" value={result.inputs.expiryLabel} />
                  ) : null}
                  <ReceiptRow term="Rounding" value={result.rounding} />
                  <ReceiptRow
                    term="Numerical rule"
                    value="A non-finite result is blocked as invalid_input, never shown"
                  />
                  <ReceiptRow term="IV solver" value="None: no volatility is implied" />
                </dl>
                <p className="type-caption pb-2 text-ink-muted">
                  MicroNest model: Black-Scholes-Merton with continuous dividend yield. This is a
                  user-assumption model illustration and is not an NSE settlement or exchange
                  pricing calculation. Inputs are typed by you — unverified, not real-time. The
                  model value is not a prediction of where the option will trade, and scenarios are
                  not forecasts. American exercise, discrete dividends and changing inputs sit
                  outside this model. Not investment advice.
                </p>
              </details>
            </Card>

            <Card as="section" aria-labelledby="greek-map-spot-heading">
              <h3 id="greek-map-spot-heading" className="type-subtitle">
                What-if (not a forecast)
              </h3>
              <p className="type-caption mt-1 text-ink-muted">
                Spot moves with strike, DTE, volatility, rate and dividend yield held constant.
              </p>
              <div className="mt-4 space-y-4">
                {result.spotScenarios.map((row) => (
                  <article
                    key={row.scenarioPct}
                    aria-label={`Spot ${row.scenarioPct}% scenario`}
                    className="rounded-lg border border-line bg-surface-muted/40 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="type-label tnum text-ink">
                        Spot {row.scenarioPct > 0 ? `+${row.scenarioPct}%` : `${row.scenarioPct}%`}{" "}
                        · {formatPaise(row.spotPaise)}
                      </h4>
                      {row.isBase ? <Badge tone="primary">Your inputs</Badge> : null}
                    </div>
                    <dl className="mt-2 divide-y divide-line border-t border-line">
                      <ReceiptRow term="Model value" value={formatPaise(row.pricePaise)} />
                      <GreekRow term="Delta" value={formatDecimal(row.delta, 4)} unit="per ₹1" />
                      <GreekRow term="Gamma" value={formatDecimal(row.gamma, 6)} unit="per ₹1" />
                      <GreekRow
                        term="Theta"
                        value={formatDecimal(row.thetaPerDay, 2)}
                        unit="₹ / calendar day"
                      />
                      <GreekRow
                        term="Vega"
                        value={formatDecimal(row.vegaPer1pp, 2)}
                        unit="₹ / 1pp IV"
                      />
                    </dl>
                  </article>
                ))}
              </div>
            </Card>

            <Card as="section" aria-labelledby="greek-map-time-heading">
              <h3 id="greek-map-time-heading" className="type-subtitle">
                What-if (not a forecast)
              </h3>
              <p className="type-caption mt-1 text-ink-muted">
                Fewer days to expiry with spot, volatility, rate and dividend yield held constant.
              </p>
              <div className="mt-4 space-y-4">
                {result.timeScenarios.map((row) => (
                  <article
                    key={row.minusDays}
                    aria-label={`Minus ${row.minusDays} day scenario`}
                    className="rounded-lg border border-line bg-surface-muted/40 p-4"
                  >
                    <h4 className="type-label text-ink">
                      −{row.minusDays} {row.minusDays === 1 ? "day" : "days"}
                    </h4>
                    {row.omitted ? (
                      <p className="type-helper mt-2 text-ink-muted">
                        omitted — V1 has a 1-day DTE floor
                      </p>
                    ) : (
                      <dl className="mt-2 divide-y divide-line border-t border-line">
                        <ReceiptRow term="Model value" value={formatPaise(row.pricePaise)} />
                        <GreekRow
                          term="Theta"
                          value={formatDecimal(row.thetaPerDay, 2)}
                          unit="₹ / calendar day"
                        />
                      </dl>
                    )}
                  </article>
                ))}
              </div>
            </Card>
          </div>
        )}
        <Callout title="Understand your trade before taking it" className="mt-6">
          GreekMap replays your own assumptions through a textbook model. It does not predict
          prices, rank outcomes, or tell you what to buy or sell.
        </Callout>
      </section>
    </div>
  );
}
