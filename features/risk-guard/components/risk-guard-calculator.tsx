"use client";

import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Field, TextInput } from "@/components/ui/form-field";
import { Metric } from "@/components/ui/metric";
import { Receipt, ReceiptDisclaimer, ReceiptRow, ReceiptSection } from "@/components/ui/receipt";
import {
  decidePosition,
  parsePercentToBps,
  parseRupeesToPaise,
  type RiskGuardBlocked,
  type RiskGuardResult,
} from "@/features/risk-guard/risk-guard";
import {
  riskGuardFieldsSchema,
  toRiskGuardInput,
  type RiskGuardHandoffFields,
  type RiskGuardRawFields,
} from "@/features/risk-guard/validation";

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

/** Exact paise → plain rupee string for handoff URLs (trailing zeros trimmed). */
function paiseToRupees(paise: number): string {
  if (paise % 100 === 0) return String(paise / 100);
  if (paise % 10 === 0) return `${Math.trunc(paise / 100)}.${String((paise % 100) / 10)}`;
  return `${Math.trunc(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-IN");
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

function parsedPercentConfirmation(raw: string): string | null {
  if (raw.trim() === "") return null;
  const bps = parsePercentToBps(raw);
  return bps === null ? null : `Parsed as ${(bps / 100).toFixed(2)}%`;
}

const EMPTY_FIELDS: RiskGuardRawFields = {
  capital: "",
  riskPercent: "",
  direction: "long",
  entry: "",
  stop: "",
  lotSize: "",
  target: "",
};

function BlockedDetails({ result }: { result: RiskGuardBlocked }) {
  return (
    <dl className="mt-4 divide-y divide-line border-t border-line">
      <ReceiptRow term="Risk budget" value={formatPaise(result.riskBudgetPaise)} />
      {result.riskPerUnitPaise !== null ? (
        <ReceiptRow term="Per-unit risk" value={formatPaise(result.riskPerUnitPaise)} />
      ) : null}
      {result.requiredForOneLotPaise !== null ? (
        <ReceiptRow
          term="Risk required for one lot"
          value={formatPaise(result.requiredForOneLotPaise)}
        />
      ) : null}
      <ReceiptRow term="Maximum affordable quantity" value={formatCount(result.maxQuantity)} />
    </dl>
  );
}

/** Display a carried handoff string as money. Handoff values are pre-validated; stay total. */
function formatPlanPaise(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const paise = parseRupeesToPaise(raw);
  return paise === null ? raw : formatPaise(paise);
}

/**
 * Plan-origin values, frozen at handoff time. Read from the initial prop —
 * never from live form state — so an edited value is never mislabelled as
 * the original plan.
 */
function PlanOriginDetails({ handoff }: { handoff: RiskGuardHandoffFields }) {
  const entry = formatPlanPaise(handoff.entry);
  const stop = formatPlanPaise(handoff.stop);
  const target = formatPlanPaise(handoff.target);
  return (
    <dl className="divide-y divide-line border-t border-line">
      {handoff.direction !== undefined ? (
        <ReceiptRow term="Plan direction" value={handoff.direction} />
      ) : null}
      {entry !== null ? <ReceiptRow term="Plan entry" value={entry} /> : null}
      {stop !== null ? <ReceiptRow term="Plan stop" value={stop} /> : null}
      <ReceiptRow term="Plan target" value={target ?? "No target carried"} />
    </dl>
  );
}

/**
 * Read-only comparison of the carried plan against the authoritative sizing
 * result. Consumes both results as-is; computes nothing new.
 */
function DecisionComparison({
  handoff,
  result,
}: {
  handoff: RiskGuardHandoffFields;
  result: RiskGuardResult;
}) {
  return (
    <Card className="mt-6">
      <h3 className="type-subtitle">Decision comparison</h3>
      <p className="type-helper mt-1.5 text-ink-muted">
        Plan values as carried in. Sizing calculated from the current form.
      </p>
      <p className="type-eyebrow mt-4 text-ink-muted">From your TradePlan</p>
      <div className="mt-1">
        <PlanOriginDetails handoff={handoff} />
      </div>
      {result.status === "allowed" ? (
        <>
          <p className="type-eyebrow mt-4 text-ink-muted">Sizing result</p>
          <dl className="mt-1 divide-y divide-line border-t border-line">
            <ReceiptRow term="Risk budget" value={formatPaise(result.riskBudgetPaise)} />
            <ReceiptRow
              term="Allowed quantity"
              value={`${formatCount(result.quantity)} units · ${formatCount(result.lots)} ${result.lots === 1 ? "lot" : "lots"}`}
            />
            <ReceiptRow term="Used risk" value={formatPaise(result.usedRiskPaise)} />
            <ReceiptRow term="Unused budget" value={formatPaise(result.unusedRiskPaise)} />
            {result.riskRewardRatio !== null ? (
              <ReceiptRow term="R:R" value={`${result.riskRewardRatio.toFixed(2)} : 1`} />
            ) : null}
          </dl>
        </>
      ) : (
        <p className="type-helper mt-4 text-ink-muted">
          No position authorized — the blocked reason above applies to these inputs.
        </p>
      )}
    </Card>
  );
}

export function RiskGuardCalculator({
  initialFields = {},
}: {
  /** Best-effort prefill from a TradePlan handoff. Always editable, never trusted. */
  initialFields?: RiskGuardHandoffFields;
}) {
  const [fields, setFields] = useState<RiskGuardRawFields>({ ...EMPTY_FIELDS, ...initialFields });
  const [errors, setErrors] = useState<Partial<Record<keyof RiskGuardRawFields, string>>>({});
  const [result, setResult] = useState<RiskGuardResult | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const hasHandoff =
    initialFields.direction !== undefined ||
    initialFields.entry !== undefined ||
    initialFields.stop !== undefined ||
    initialFields.target !== undefined;

  function setField(name: keyof RiskGuardRawFields, value: string) {
    setFields((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = riskGuardFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof RiskGuardRawFields, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof RiskGuardRawFields | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setResult(null);
      setAnnouncement("Check the highlighted fields and try again.");
      return;
    }
    setErrors({});
    const decision = decidePosition(toRiskGuardInput(parsed.data));
    setResult(decision);
    setAnnouncement(
      decision.status === "allowed"
        ? `Allowed quantity ${formatCount(decision.quantity)} in ${formatCount(decision.lots)} lots.`
        : `Trade blocked. ${decision.reason}`,
    );
  }

  const describe = (id: string, hint: boolean, hasError: boolean) =>
    hasError ? `${id}-error` : hint ? `${id}-hint` : undefined;

  // Ephemeral handoff: only direction/entry/optional-target/quantity travel, as
  // plain query values. TradeCost re-validates everything on arrival; no
  // capital, risk %, narrative or brokerage ever enters the URL.
  function costHref(): string {
    if (result === null || result.status !== "allowed") return "/tools/trade-cost";
    const params = new URLSearchParams({
      direction: result.inputs.direction,
      entry: paiseToRupees(result.inputs.entryPaise),
      quantity: String(result.quantity),
    });
    if (result.inputs.targetPaise !== undefined)
      params.set("target", paiseToRupees(result.inputs.targetPaise));
    return `/tools/trade-cost?${params.toString()}`;
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card as="section" aria-labelledby="risk-guard-inputs-heading">
        <h2 id="risk-guard-inputs-heading" className="type-section">
          Your inputs
        </h2>
        {hasHandoff ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">From your TradePlan</Badge>
            <p className="type-caption text-ink-muted">
              Carried forward for you — review or change anything. RiskGuard calculates from what is
              in this form.
            </p>
          </div>
        ) : null}
        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-6">
          <fieldset className="space-y-4">
            <legend className="type-eyebrow text-ink-muted">Risk budget</legend>
            <Field
              id="rg-capital"
              label="Capital (₹)"
              hint="Total capital you are sizing against."
              error={errors.capital}
              confirmation={parsedMoneyConfirmation(fields.capital)}
            >
              <TextInput
                id="rg-capital"
                name="capital"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="100000"
                prefix="₹"
                invalid={Boolean(errors.capital)}
                value={fields.capital}
                onChange={(event) => setField("capital", event.target.value)}
                aria-describedby={describe("rg-capital", true, Boolean(errors.capital))}
              />
            </Field>
            <Field
              id="rg-risk"
              label="Risk %"
              hint="How much of your capital you accept losing on this trade."
              error={errors.riskPercent}
              confirmation={parsedPercentConfirmation(fields.riskPercent)}
            >
              <TextInput
                id="rg-risk"
                name="riskPercent"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="2.5"
                suffix="%"
                invalid={Boolean(errors.riskPercent)}
                value={fields.riskPercent}
                onChange={(event) => setField("riskPercent", event.target.value)}
                aria-describedby={describe("rg-risk", true, Boolean(errors.riskPercent))}
              />
            </Field>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="type-eyebrow text-ink-muted">Trade</legend>
            <div>
              <span id="rg-direction-label" className="type-label block text-ink">
                Direction
              </span>
              <div
                role="radiogroup"
                aria-labelledby="rg-direction-label"
                className="mt-1.5 grid grid-cols-2 gap-2"
              >
                {(
                  [
                    { value: "long", label: "Long" },
                    { value: "short", label: "Short" },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={`type-label inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 transition-colors ${
                      fields.direction === option.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-line bg-surface text-ink-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="direction"
                      value={option.value}
                      checked={fields.direction === option.value}
                      onChange={() => setField("direction", option.value)}
                      className="size-4 accent-[#064e3b]"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {errors.direction ? (
                <p id="rg-direction-error" className="type-caption mt-1 font-medium text-danger">
                  {errors.direction}
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-3 lg:grid-cols-1 xl:grid-cols-2">
              <Field
                id="rg-entry"
                label="Entry (₹)"
                hint="Your planned entry price."
                error={errors.entry}
                confirmation={parsedMoneyConfirmation(fields.entry)}
              >
                <TextInput
                  id="rg-entry"
                  name="entry"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="100"
                  prefix="₹"
                  invalid={Boolean(errors.entry)}
                  value={fields.entry}
                  onChange={(event) => setField("entry", event.target.value)}
                  aria-describedby={describe("rg-entry", true, Boolean(errors.entry))}
                />
              </Field>
              <Field
                id="rg-stop"
                label="Stop-loss (₹)"
                hint="Below entry for long, above for short."
                error={errors.stop}
                confirmation={parsedMoneyConfirmation(fields.stop)}
              >
                <TextInput
                  id="rg-stop"
                  name="stop"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="95"
                  prefix="₹"
                  invalid={Boolean(errors.stop)}
                  value={fields.stop}
                  onChange={(event) => setField("stop", event.target.value)}
                  aria-describedby={describe("rg-stop", true, Boolean(errors.stop))}
                />
              </Field>
            </div>
            <Field
              id="rg-lotsize"
              label="Lot size"
              hint="Units per lot. Use 1 for equity delivery."
              error={errors.lotSize}
            >
              <TextInput
                id="rg-lotsize"
                name="lotSize"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="1"
                invalid={Boolean(errors.lotSize)}
                value={fields.lotSize}
                onChange={(event) => setField("lotSize", event.target.value)}
                aria-describedby={describe("rg-lotsize", true, Boolean(errors.lotSize))}
              />
            </Field>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="type-eyebrow text-ink-muted">Optional</legend>
            <Field
              id="rg-target"
              label="Target (₹)"
              hint="Leave blank if you have no target. R:R is only shown with a target."
              error={errors.target}
              confirmation={parsedMoneyConfirmation(fields.target)}
            >
              <TextInput
                id="rg-target"
                name="target"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Optional"
                prefix="₹"
                invalid={Boolean(errors.target)}
                value={fields.target}
                onChange={(event) => setField("target", event.target.value)}
                aria-describedby={describe("rg-target", true, Boolean(errors.target))}
              />
            </Field>
          </fieldset>

          <Button type="submit" className="w-full sm:w-auto">
            Calculate position size
          </Button>
        </form>
      </Card>

      <section aria-labelledby="risk-guard-result-heading" aria-live="polite">
        <h2 id="risk-guard-result-heading" className="sr-only">
          Result
        </h2>
        <p className="sr-only">{announcement}</p>
        {result === null ? (
          <Card>
            <h3 className="type-subtitle">Your result will appear here</h3>
            <p className="type-helper mt-1.5 text-ink-muted">
              Enter your capital, risk %, direction, entry, stop and lot size, then calculate. The
              tool checks the trade against your own risk budget — it never recommends what to buy
              or sell.
            </p>
          </Card>
        ) : result.status === "allowed" ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="ok">Within your risk budget</Badge>
              <span className="type-caption text-ink-muted">RG-001</span>
            </div>
            <h3 className="type-subtitle mt-4">Allowed quantity</h3>
            <Metric
              value={formatCount(result.quantity)}
              supporting={`units · ${formatCount(result.lots)} ${result.lots === 1 ? "lot" : "lots"}`}
            />
            <dl className="mt-4 divide-y divide-line border-t border-line">
              <ReceiptRow term="Risk budget" value={formatPaise(result.riskBudgetPaise)} />
              <ReceiptRow term="Per-unit risk" value={formatPaise(result.riskPerUnitPaise)} />
              <ReceiptRow term="Used risk" value={formatPaise(result.usedRiskPaise)} />
              <ReceiptRow term="Unused budget" value={formatPaise(result.unusedRiskPaise)} />
              {result.riskRewardRatio !== null && result.rewardPerUnitPaise !== null ? (
                <ReceiptRow
                  term="Reward : risk"
                  value={`${result.riskRewardRatio.toFixed(2)} : 1 (${formatPaise(result.rewardPerUnitPaise)} per unit)`}
                />
              ) : null}
            </dl>
            <Receipt summary="Calculation receipt · RG-001">
              <ReceiptSection title="Inputs">
                <ReceiptRow term="Capital" value={formatPaise(result.inputs.capitalPaise)} />
                <ReceiptRow term="Risk" value={`${(result.inputs.riskBps / 100).toFixed(2)}%`} />
                <ReceiptRow term="Direction" value={result.inputs.direction} />
                <ReceiptRow term="Entry" value={formatPaise(result.inputs.entryPaise)} />
                <ReceiptRow term="Stop-loss" value={formatPaise(result.inputs.stopPaise)} />
                <ReceiptRow term="Lot size" value={formatCount(result.inputs.lotSize)} />
                {result.inputs.targetPaise !== undefined ? (
                  <ReceiptRow term="Target" value={formatPaise(result.inputs.targetPaise)} />
                ) : null}
              </ReceiptSection>
              <ReceiptSection title="Outputs">
                <ReceiptRow
                  term="Maximum before lot flooring"
                  value={formatCount(result.maxQuantity)}
                />
              </ReceiptSection>
              <ReceiptSection title="Rounding">
                <ReceiptRow term="Rounding" value={result.rounding} />
              </ReceiptSection>
              <ReceiptDisclaimer>
                Charges and slippage are excluded. Verify with your broker. Not investment advice.
              </ReceiptDisclaimer>
            </Receipt>
            <h3 className="type-subtitle mt-5">Next decision</h3>
            <p className="type-helper mt-1.5 text-ink-muted">
              An affordable size is not automatically a cheap trade. TradeCost will now check what
              transaction costs do to the economics of this sizing.
            </p>
            <a
              href={costHref()}
              className="type-label mt-3 inline-flex min-h-11 items-center text-primary underline underline-offset-4"
            >
              Check costs in TradeCost
            </a>
          </Card>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="danger">Trade blocked</Badge>
              <span className="type-caption text-ink-muted">RG-001</span>
            </div>
            <p className="type-body mt-3">{result.reason}</p>
            <BlockedDetails result={result} />
            <Receipt summary="Calculation receipt · RG-001">
              <ReceiptSection title="Inputs">
                <ReceiptRow term="Capital" value={formatPaise(result.inputs.capitalPaise)} />
                <ReceiptRow term="Risk" value={`${(result.inputs.riskBps / 100).toFixed(2)}%`} />
                <ReceiptRow term="Direction" value={result.inputs.direction} />
                <ReceiptRow term="Entry" value={formatPaise(result.inputs.entryPaise)} />
                <ReceiptRow term="Stop-loss" value={formatPaise(result.inputs.stopPaise)} />
                <ReceiptRow term="Lot size" value={formatCount(result.inputs.lotSize)} />
              </ReceiptSection>
              <ReceiptSection title="Rounding">
                <ReceiptRow term="Rounding" value={result.rounding} />
              </ReceiptSection>
              <ReceiptDisclaimer>
                Charges and slippage are excluded. Verify with your broker. Not investment advice.
              </ReceiptDisclaimer>
            </Receipt>
          </Card>
        )}
        {hasHandoff && result !== null ? (
          <DecisionComparison handoff={initialFields} result={result} />
        ) : null}
        <Callout title="Understand your trade before taking it" className="mt-6">
          RiskGuard calculates the consequences of the numbers you enter. It does not predict
          profit, guarantee safety, or recommend trades.
        </Callout>
      </section>
    </div>
  );
}
