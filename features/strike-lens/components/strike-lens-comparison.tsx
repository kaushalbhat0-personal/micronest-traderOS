"use client";

import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Field, TextInput } from "@/components/ui/form-field";
import { Receipt, ReceiptDisclaimer, ReceiptRow, ReceiptSection } from "@/components/ui/receipt";
import { ScenarioRow } from "@/components/ui/scenario-row";
import { WarningState } from "@/components/ui/warning-state";
import {
  compareStrikes,
  parseRupeesToPaise,
  STRIKE_LENS_FORMULA_ID,
  STRIKE_LENS_MAX_ROWS,
  STRIKE_LENS_MIN_ROWS,
  type StrikeLensResult,
} from "@/features/strike-lens/strike-lens";
import {
  strikeLensFieldsSchema,
  toStrikeLensInput,
  type StrikeLensHandoffFields,
  type StrikeLensRawFields,
} from "@/features/strike-lens/validation";

const inrExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display-only formatting at the UI edge; the engine only sees integer paise. */
function formatPaise(paise: number): string {
  return inrExact.format(paise / 100);
}

/** Integer basis points → two-decimal percent string. Display only. */
function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function formatSignedPaise(paise: number): string {
  const sign = paise > 0 ? "+" : "";
  return `${sign}${formatPaise(paise)}`;
}

/**
 * Presentation-level parsed confirmation. Uses the tool's existing domain
 * parser — never a second parser — and returns null for empty or unparseable
 * input so the line disappears naturally. Shown only when the field has no
 * validation error (the shared Field handles that).
 */
function parsedMoneyConfirmation(raw: string): string | null {
  if (raw.trim() === "") return null;
  const paise = parseRupeesToPaise(raw);
  return paise === null ? null : `Parsed as ${formatPaise(paise)}`;
}

const EMPTY_ROW = { strike: "", premium: "" };

const EMPTY_FIELDS: StrikeLensRawFields = {
  spot: "",
  optionType: "call",
  rows: [{ ...EMPTY_ROW }],
  expiryLabel: "",
};

const LABEL_CLASS = "type-label block text-ink";
const HINT_CLASS = "type-caption mt-1 text-ink-muted";
const ERROR_CLASS = "type-caption mt-1 font-medium text-danger";

export function StrikeLensComparison({
  initialFields = {},
}: {
  /** Best-effort prefill of the spot price. Always editable, never trusted. */
  initialFields?: StrikeLensHandoffFields;
}) {
  const [fields, setFields] = useState<StrikeLensRawFields>({
    ...EMPTY_FIELDS,
    ...(initialFields.spot !== undefined ? { spot: initialFields.spot } : {}),
  });
  const [rowErrors, setRowErrors] = useState<Array<{ strike?: string; premium?: string }>>([]);
  const [errors, setErrors] = useState<{
    spot?: string;
    optionType?: string;
    expiryLabel?: string;
  }>({});
  const [result, setResult] = useState<StrikeLensResult | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const hasHandoff = initialFields.spot !== undefined;

  function setField(name: "spot" | "optionType" | "expiryLabel", value: string) {
    setFields((prev) => ({ ...prev, [name]: value }));
    // The comparison belongs to one option type: switching CE/PE clears a
    // stale result so it can never be read under the wrong type.
    if (name === "optionType") setResult(null);
  }

  function setRow(index: number, name: "strike" | "premium", value: string) {
    setFields((prev) => ({
      ...prev,
      rows: prev.rows.map((row, i) => (i === index ? { ...row, [name]: value } : row)),
    }));
  }

  function addRow() {
    if (fields.rows.length >= STRIKE_LENS_MAX_ROWS) return;
    setFields((prev) => ({ ...prev, rows: [...prev.rows, { ...EMPTY_ROW }] }));
    setRowErrors((prev) => [...prev, {}]);
  }

  function removeRow(index: number) {
    if (fields.rows.length <= STRIKE_LENS_MIN_ROWS) return;
    setFields((prev) => ({ ...prev, rows: prev.rows.filter((_, i) => i !== index) }));
    setRowErrors((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = strikeLensFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      const nextErrors: typeof errors = {};
      const nextRowErrors: Array<{ strike?: string; premium?: string }> = fields.rows.map(
        () => ({}),
      );
      for (const issue of parsed.error.issues) {
        const [head, index, leaf] = issue.path as Array<string | number | undefined>;
        if (
          head === "rows" &&
          typeof index === "number" &&
          (leaf === "strike" || leaf === "premium")
        ) {
          const rowErrs = nextRowErrors[index];
          if (rowErrs !== undefined && rowErrs[leaf] === undefined) rowErrs[leaf] = issue.message;
        } else if (head === "spot" || head === "optionType" || head === "expiryLabel") {
          if (!nextErrors[head]) nextErrors[head] = issue.message;
        } else if (head === "rows" && typeof index !== "number") {
          // Set-level rows error (e.g. too many rows): announce it.
          setAnnouncement(issue.message);
        }
      }
      setErrors(nextErrors);
      setRowErrors(nextRowErrors);
      setResult(null);
      setAnnouncement((prev) => prev || "Check the highlighted fields and try again.");
      return;
    }
    setErrors({});
    setRowErrors(fields.rows.map(() => ({})));
    const compared = compareStrikes(toStrikeLensInput(parsed.data));
    setResult(compared);
    setAnnouncement(
      compared.status === "compared"
        ? `Compared ${compared.rows.length} ${compared.rows.length === 1 ? "strike" : "strikes"}.`
        : `${compared.reason}`,
    );
  }

  const describe = (id: string, hint: boolean, hasError: boolean) =>
    hasError ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const optionLabel = fields.optionType === "call" ? "CE" : "PE";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card as="section" aria-labelledby="strike-lens-inputs-heading">
        <h2 id="strike-lens-inputs-heading" className="type-section">
          Your inputs
        </h2>
        {hasHandoff ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Spot carried forward</Badge>
            <p className="type-caption text-ink-muted">
              Review or change it. StrikeLens compares what is in this form.
            </p>
          </div>
        ) : null}
        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-6">
          <fieldset className="space-y-4">
            <legend className="type-eyebrow text-ink-muted">Underlying</legend>
            <Field
              id="sl-spot"
              label="Spot (₹)"
              hint="The underlying price you want to compare against."
              error={errors.spot}
              confirmation={parsedMoneyConfirmation(fields.spot)}
            >
              <TextInput
                id="sl-spot"
                name="spot"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="100"
                prefix="₹"
                invalid={Boolean(errors.spot)}
                value={fields.spot}
                onChange={(event) => setField("spot", event.target.value)}
                aria-describedby={describe("sl-spot", true, Boolean(errors.spot))}
              />
            </Field>

            <div>
              <span id="sl-type-label" className={LABEL_CLASS}>
                Option type
              </span>
              <div
                role="radiogroup"
                aria-labelledby="sl-type-label"
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
                <p id="sl-type-error" className={ERROR_CLASS}>
                  {errors.optionType}
                </p>
              ) : (
                <p id="sl-type-hint" className={HINT_CLASS}>
                  One type per comparison.
                </p>
              )}
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="type-eyebrow text-ink-muted">
              Strikes · {fields.rows.length} of {STRIKE_LENS_MAX_ROWS}
            </legend>
            {fields.rows.map((row, index) => {
              const strikeId = `sl-strike-${index}`;
              const premiumId = `sl-premium-${index}`;
              const rowError = rowErrors[index] ?? {};
              return (
                <div key={index} className="rounded-lg border border-line bg-surface-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="type-label text-ink">Strike {index + 1}</p>
                    {fields.rows.length > STRIKE_LENS_MIN_ROWS ? (
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        aria-label={`Remove strike ${index + 1}`}
                        className="type-label inline-flex min-h-11 items-center px-2 text-danger underline underline-offset-4"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 grid gap-4 sm:grid-cols-2">
                    <Field
                      id={strikeId}
                      label="Strike (₹)"
                      error={rowError.strike}
                      confirmation={parsedMoneyConfirmation(row.strike)}
                    >
                      <TextInput
                        id={strikeId}
                        name={`strike-${index}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="95"
                        prefix="₹"
                        invalid={Boolean(rowError.strike)}
                        value={row.strike}
                        onChange={(event) => setRow(index, "strike", event.target.value)}
                        aria-describedby={rowError.strike ? `${strikeId}-error` : undefined}
                      />
                    </Field>
                    <Field
                      id={premiumId}
                      label="Premium (₹)"
                      error={rowError.premium}
                      confirmation={parsedMoneyConfirmation(row.premium)}
                    >
                      <TextInput
                        id={premiumId}
                        name={`premium-${index}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="8"
                        prefix="₹"
                        invalid={Boolean(rowError.premium)}
                        value={row.premium}
                        onChange={(event) => setRow(index, "premium", event.target.value)}
                        aria-describedby={rowError.premium ? `${premiumId}-error` : undefined}
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
            {fields.rows.length < STRIKE_LENS_MAX_ROWS ? (
              <Button
                type="button"
                variant="secondary"
                onClick={addRow}
                className="w-full sm:w-auto"
              >
                Add strike
              </Button>
            ) : null}
          </fieldset>

          <Field
            id="sl-expiry"
            label="Expiry label (optional)"
            hint="Display only, e.g. NIFTY 30 OCT. Never enters a calculation."
            error={errors.expiryLabel}
          >
            <TextInput
              id="sl-expiry"
              name="expiryLabel"
              type="text"
              autoComplete="off"
              placeholder="Optional"
              invalid={Boolean(errors.expiryLabel)}
              value={fields.expiryLabel}
              onChange={(event) => setField("expiryLabel", event.target.value)}
              aria-describedby={describe("sl-expiry", true, Boolean(errors.expiryLabel))}
            />
          </Field>

          <Button type="submit" className="w-full sm:w-auto">
            Compare strikes
          </Button>
        </form>
      </Card>

      <section aria-labelledby="strike-lens-result-heading" aria-live="polite">
        <h2 id="strike-lens-result-heading" className="sr-only">
          Result
        </h2>
        <p className="sr-only">{announcement}</p>
        {result === null ? (
          <Card>
            <h3 className="type-subtitle">Your comparison will appear here</h3>
            <p className="type-helper mt-1.5 text-ink-muted">
              Add up to 5 strikes of the same type to compare. The tool compares price, moneyness,
              value split, distance and breakeven — it never ranks or recommends a strike.
            </p>
          </Card>
        ) : result.status === "invalid" ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="danger">Cannot compare</Badge>
              <span className="type-caption text-ink-muted">{STRIKE_LENS_FORMULA_ID}</span>
            </div>
            <p className="type-body mt-3">{result.reason}</p>
          </Card>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="neutral">
                Compared {result.rows.length} {result.rows.length === 1 ? "strike" : "strikes"}
              </Badge>
              <span className="type-caption text-ink-muted">{STRIKE_LENS_FORMULA_ID}</span>
            </div>
            <div className="mt-4 space-y-4">
              {result.rows.map((row) => (
                <ScenarioRow
                  key={row.strikePaise}
                  label={`${formatPaise(row.strikePaise)} ${optionLabel}`}
                  ariaLabel={`Strike ${formatPaise(row.strikePaise)} ${optionLabel}`}
                  headingLevel="h3"
                  markers={[
                    { text: row.moneyness, tone: "neutral" },
                    ...(row.isNearestToSpot
                      ? [{ text: "Nearest to spot", tone: "neutral" as const }]
                      : []),
                    ...(row.status === "inconsistent"
                      ? [{ text: "Check premium", tone: "warn" as const }]
                      : []),
                  ]}
                  note={
                    row.breakevenAtOrBelowZero
                      ? "Breakeven at or below zero — premium covers the full strike."
                      : undefined
                  }
                  className={row.status === "inconsistent" ? "border-warn/40 bg-warn/5" : undefined}
                >
                  {row.status === "inconsistent" ? (
                    <WarningState
                      className="mb-3"
                      message={
                        <>
                          Premium {formatPaise(row.premiumPaise)} is below intrinsic value{" "}
                          {formatPaise(row.intrinsicPaise)}. Check the premium or strike — extrinsic
                          value cannot be negative.
                        </>
                      }
                    />
                  ) : null}
                  <dl className="divide-y divide-line border-t border-line">
                    <ReceiptRow term="Premium" value={formatPaise(row.premiumPaise)} />
                    <ReceiptRow term="Intrinsic value" value={formatPaise(row.intrinsicPaise)} />
                    <ReceiptRow
                      term="Extrinsic value"
                      value={row.extrinsicPaise === null ? "—" : formatPaise(row.extrinsicPaise)}
                    />
                    <ReceiptRow
                      term="Distance from spot"
                      value={`${formatSignedPaise(row.distancePaise)} (${formatBps(row.distanceBps)})`}
                    />
                    <ReceiptRow
                      term="Option breakeven before transaction costs"
                      value={formatPaise(row.breakevenPaise)}
                    />
                  </dl>
                </ScenarioRow>
              ))}
            </div>
            <Receipt summary={`Calculation receipt · ${STRIKE_LENS_FORMULA_ID}`}>
              <ReceiptSection title="Inputs">
                <ReceiptRow term="Spot" value={formatPaise(result.inputs.spotPaise)} />
                <ReceiptRow
                  term="Option type"
                  value={result.inputs.optionType === "call" ? "CE (Call)" : "PE (Put)"}
                />
                {result.inputs.expiryLabel !== undefined ? (
                  <ReceiptRow term="Expiry label" value={result.inputs.expiryLabel} />
                ) : null}
              </ReceiptSection>
              <ReceiptSection title="Method">
                {result.inputs.optionType === "call" ? (
                  <ReceiptRow term="Intrinsic formula" value="max(spot − strike, 0)" />
                ) : (
                  <ReceiptRow term="Intrinsic formula" value="max(strike − spot, 0)" />
                )}
                <ReceiptRow
                  term="Extrinsic formula"
                  value="premium − intrinsic (when premium ≥ intrinsic)"
                />
                <ReceiptRow term="Distance formula" value="strike − spot" />
                <ReceiptRow
                  term="Percentage distance"
                  value="round(|distance| × 10,000 / spot) bps, half-up"
                />
                {result.inputs.optionType === "call" ? (
                  <ReceiptRow term="Breakeven formula" value="strike + premium" />
                ) : (
                  <ReceiptRow term="Breakeven formula" value="strike − premium" />
                )}
                <ReceiptRow
                  term="Moneyness"
                  value="exact spot = strike is ATM; otherwise by side"
                />
              </ReceiptSection>
              <ReceiptSection title="Rounding">
                <ReceiptRow term="Rounding" value={result.rounding} />
              </ReceiptSection>
              <ReceiptDisclaimer>
                User-provided market inputs — not verified by MicroNest, not real-time. Long
                positions, expiry payoff, costs excluded. Not investment advice.
              </ReceiptDisclaimer>
            </Receipt>
          </Card>
        )}
        <Callout title="Understand your trade before taking it" className="mt-6">
          StrikeLens compares the strikes you enter. It does not predict which strike will win, rank
          strikes, or recommend what to buy or sell.
        </Callout>
      </section>
    </div>
  );
}
