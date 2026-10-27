"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { COST_RATE_SET } from "@/config/cost-rates";
import {
  calculateCosts,
  parseRupeesToPaise,
  type TradeCostComputed,
  type TradeCostResult,
  type TradeCostUnsupported,
} from "@/features/trade-cost/trade-cost";
import {
  toTradeCostInput,
  tradeCostFieldsSchema,
  type TradeCostHandoffFields,
  type TradeCostRawFields,
} from "@/features/trade-cost/validation";

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

function formatCount(value: number): string {
  return value.toLocaleString("en-IN");
}

const EMPTY_FIELDS: TradeCostRawFields = {
  direction: "long",
  mode: "delivery",
  buyPrice: "",
  sellPrice: "",
  quantity: "",
  brokerage: "",
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

function RadioGroup<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: string;
  onChange: (value: T) => void;
  error?: string;
}) {
  return (
    <div>
      <span id={`${id}-label`} className={LABEL_CLASS}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="mt-1.5 grid grid-cols-2 gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={`type-label inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 transition-colors ${
              value === option.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-line bg-surface text-ink-muted"
            }`}
          >
            <input
              type="radio"
              name={id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="size-4 accent-[#064e3b]"
            />
            {option.label}
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${id}-error`} className={ERROR_CLASS}>
          {error}
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

/** Display a carried handoff string as money. Handoff values are pre-validated; stay total. */
function formatPlanPaise(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const paise = parseRupeesToPaise(raw);
  return paise === null ? raw : formatPaise(paise);
}

/**
 * Plan-origin values, frozen at handoff time. Read from the initial prop —
 * never from live form state — so an edited value is never mislabelled as
 * the sized position.
 */
function CostOriginDetails({ handoff }: { handoff: TradeCostHandoffFields }) {
  const entry = formatPlanPaise(handoff.entry);
  const target = formatPlanPaise(handoff.target);
  return (
    <dl className="divide-y divide-line border-t border-line">
      {handoff.direction !== undefined ? (
        <ReceiptRow term="Sized direction" value={handoff.direction} />
      ) : null}
      {entry !== null ? <ReceiptRow term="Sized entry" value={entry} /> : null}
      <ReceiptRow term="Sized target" value={target ?? "No target carried"} />
      <ReceiptRow
        term="Sized quantity"
        value={handoff.quantity !== undefined ? formatCount(Number(handoff.quantity)) : "—"}
      />
    </dl>
  );
}

function ChargesList({ result }: { result: TradeCostComputed }) {
  return (
    <dl className="mt-4 divide-y divide-line border-t border-line">
      <ReceiptRow term="Gross P&L" value={formatPaise(result.grossPnlPaise)} />
      <ReceiptRow term="Brokerage (your assumption)" value={formatPaise(result.brokeragePaise)} />
      <ReceiptRow term="STT" value={formatPaise(result.sttPaise)} />
      <ReceiptRow term="NSE transaction" value={formatPaise(result.nseTxnPaise)} />
      <ReceiptRow term="NSE IPFT" value={formatPaise(result.nseIpftPaise)} />
      <ReceiptRow term="Stamp duty" value={formatPaise(result.stampDutyPaise)} />
      <ReceiptRow term="SEBI fee" value={formatPaise(result.sebiFeesPaise)} />
      <ReceiptRow term="GST" value={formatPaise(result.gstPaise)} />
      <ReceiptRow term="Total charges" value={formatPaise(result.totalChargesPaise)} />
      <ReceiptRow term="Net P&L" value={formatPaise(result.netPnlPaise)} />
    </dl>
  );
}

function UnsupportedDetails({ result }: { result: TradeCostUnsupported }) {
  return (
    <dl className="mt-4 divide-y divide-line border-t border-line">
      <ReceiptRow term="Reason code" value={result.code} />
    </dl>
  );
}

export function TradeCostCalculator({
  initialFields = {},
}: {
  /** Best-effort prefill from a RiskGuard sizing. Always editable, never trusted. */
  initialFields?: TradeCostHandoffFields;
}) {
  // Handoff mapping: long → buy=entry/sell=target; short → sell=entry/buy=target.
  // A missing target leaves the exit blank — the user must supply it.
  const prefilled: TradeCostRawFields = {
    ...EMPTY_FIELDS,
    ...(initialFields.direction !== undefined ? { direction: initialFields.direction } : {}),
    ...(initialFields.entry !== undefined
      ? initialFields.direction === "short"
        ? { sellPrice: initialFields.entry }
        : { buyPrice: initialFields.entry }
      : {}),
    ...(initialFields.target !== undefined
      ? initialFields.direction === "short"
        ? { buyPrice: initialFields.target }
        : { sellPrice: initialFields.target }
      : {}),
    ...(initialFields.quantity !== undefined ? { quantity: initialFields.quantity } : {}),
  };
  const [fields, setFields] = useState<TradeCostRawFields>(prefilled);
  const [errors, setErrors] = useState<Partial<Record<keyof TradeCostRawFields, string>>>({});
  const [result, setResult] = useState<TradeCostResult | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const hasHandoff =
    initialFields.direction !== undefined ||
    initialFields.entry !== undefined ||
    initialFields.target !== undefined ||
    initialFields.quantity !== undefined;

  function setField(name: keyof TradeCostRawFields, value: string) {
    setFields((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = tradeCostFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof TradeCostRawFields, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof TradeCostRawFields | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setResult(null);
      setAnnouncement("Check the highlighted fields and try again.");
      return;
    }
    setErrors({});
    const decision = calculateCosts(toTradeCostInput(parsed.data));
    setResult(decision);
    setAnnouncement(
      decision.status === "computed"
        ? `Net P&L ${formatPaise(decision.netPnlPaise)}.`
        : `Estimate unavailable. ${decision.reason}`,
    );
  }

  const describe = (id: string, hint: boolean, hasError: boolean) =>
    hasError ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card as="section" aria-labelledby="trade-cost-inputs-heading">
        <h2 id="trade-cost-inputs-heading" className="type-section">
          Your inputs
        </h2>
        {hasHandoff ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">From your RiskGuard sizing</Badge>
            <p className="type-caption text-ink-muted">
              Carried forward for you — review or change anything. TradeCost calculates from what
              is in this form.
            </p>
          </div>
        ) : null}
        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-6">
          <fieldset className="space-y-4">
            <legend className="type-eyebrow text-ink-muted">What are you trading</legend>
            <RadioGroup
              id="tc-direction"
              label="Direction"
              options={[
                { value: "long", label: "Long" },
                { value: "short", label: "Short" },
              ]}
              value={fields.direction}
              onChange={(value) => setField("direction", value)}
              error={errors.direction}
            />
            <RadioGroup
              id="tc-mode"
              label="Segment"
              options={[
                { value: "delivery", label: "Delivery" },
                { value: "intraday", label: "Intraday" },
              ]}
              value={fields.mode}
              onChange={(value) => setField("mode", value)}
              error={errors.mode}
            />
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="type-eyebrow text-ink-muted">Execution</legend>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-3 lg:grid-cols-1 xl:grid-cols-2">
              <Field
                id="tc-buy"
                label="Buy price (₹)"
                hint="Your buy price per share."
                error={errors.buyPrice}
              >
                <input
                  id="tc-buy"
                  name="buyPrice"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="100"
                  value={fields.buyPrice}
                  onChange={(event) => setField("buyPrice", event.target.value)}
                  aria-invalid={Boolean(errors.buyPrice)}
                  aria-describedby={describe("tc-buy", true, Boolean(errors.buyPrice))}
                  className={`${INPUT_CLASS} mt-1.5 ${errors.buyPrice ? "border-danger" : ""}`}
                />
              </Field>
              <Field
                id="tc-sell"
                label="Sell price (₹)"
                hint="Your sell or expected exit price."
                error={errors.sellPrice}
              >
                <input
                  id="tc-sell"
                  name="sellPrice"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="110"
                  value={fields.sellPrice}
                  onChange={(event) => setField("sellPrice", event.target.value)}
                  aria-invalid={Boolean(errors.sellPrice)}
                  aria-describedby={describe("tc-sell", true, Boolean(errors.sellPrice))}
                  className={`${INPUT_CLASS} mt-1.5 ${errors.sellPrice ? "border-danger" : ""}`}
                />
              </Field>
            </div>
            <Field
              id="tc-quantity"
              label="Quantity (shares)"
              hint="Shares carried from your RiskGuard sizing, or your own number."
              error={errors.quantity}
            >
              <input
                id="tc-quantity"
                name="quantity"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="100"
                value={fields.quantity}
                onChange={(event) => setField("quantity", event.target.value)}
                aria-invalid={Boolean(errors.quantity)}
                aria-describedby={describe("tc-quantity", true, Boolean(errors.quantity))}
                className={`${INPUT_CLASS} mt-1.5 ${errors.quantity ? "border-danger" : ""}`}
              />
            </Field>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="type-eyebrow text-ink-muted">Cost assumption</legend>
            <Field
              id="tc-brokerage"
              label="Brokerage total (₹)"
              hint="Both legs together, from your broker. Enter 0 when none is assumed."
              error={errors.brokerage}
            >
              <input
                id="tc-brokerage"
                name="brokerage"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="40"
                value={fields.brokerage}
                onChange={(event) => setField("brokerage", event.target.value)}
                aria-invalid={Boolean(errors.brokerage)}
                aria-describedby={describe("tc-brokerage", true, Boolean(errors.brokerage))}
                className={`${INPUT_CLASS} mt-1.5 ${errors.brokerage ? "border-danger" : ""}`}
              />
            </Field>
            <p className="type-caption text-ink-muted">
              Rate set {COST_RATE_SET.id}, effective {COST_RATE_SET.effectiveFrom}. Charges are
              estimates — verify against your broker&apos;s contract note.
            </p>
          </fieldset>

          <Button type="submit" className="w-full sm:w-auto">
            Estimate transaction costs
          </Button>
        </form>
      </Card>

      <section aria-labelledby="trade-cost-result-heading" aria-live="polite">
        <h2 id="trade-cost-result-heading" className="sr-only">
          Result
        </h2>
        <p className="sr-only">{announcement}</p>
        {result === null ? (
          <Card>
            <h3 className="type-subtitle">Your estimate will appear here</h3>
            <p className="type-helper mt-1.5 text-ink-muted">
              Enter your prices, quantity and brokerage assumption, then estimate. The tool shows
              whether the planned trade survives its transaction costs — it never places orders or
              recommends what to buy or sell.
            </p>
          </Card>
        ) : result.status === "computed" ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={result.netPnlPaise >= 0 ? "ok" : "danger"}>
                {result.netPnlPaise >= 0 ? "Survives costs" : "Eaten by costs"}
              </Badge>
              <span className="type-caption text-ink-muted">TC-001</span>
            </div>
            <h3 className="type-subtitle mt-4">Net P&L</h3>
            <p className="type-metric tnum mt-1">{formatPaise(result.netPnlPaise)}</p>
            <p className="type-body mt-3">{result.verdict}</p>
            {result.breakeven.status === "ok" ? (
              <p className="type-helper mt-1.5 text-ink-muted">
                Breakeven {result.inputs.direction === "long" ? "sell" : "cover"} price{" "}
                {formatPaise(result.breakeven.pricePaise)} (net{" "}
                {formatPaise(result.breakeven.residualPaise)} at breakeven).
              </p>
            ) : (
              <p className="type-helper mt-1.5 text-ink-muted">
                Breakeven unreachable within the allowed range.
              </p>
            )}
            <ChargesList result={result} />
            {hasHandoff ? (
              <div className="mt-4">
                <p className="type-eyebrow text-ink-muted">From your RiskGuard sizing</p>
                <div className="mt-1">
                  <CostOriginDetails handoff={initialFields} />
                </div>
              </div>
            ) : null}
            <details className="mt-4 rounded-lg border border-line bg-surface-muted/50 px-4 py-2">
              <summary className="type-label inline-flex min-h-11 cursor-pointer items-center text-ink">
                Calculation receipt · TC-001
              </summary>
              <dl className="divide-y divide-line border-t border-line pb-2">
                <ReceiptRow term="Direction" value={result.inputs.direction} />
                <ReceiptRow
                  term="Segment"
                  value={result.inputs.mode === "delivery" ? "Delivery" : "Intraday"}
                />
                <ReceiptRow term="Entry" value={formatPaise(result.inputs.entryPaise)} />
                <ReceiptRow term="Exit" value={formatPaise(result.inputs.exitPaise)} />
                <ReceiptRow term="Quantity" value={formatCount(result.inputs.quantity)} />
                <ReceiptRow term="Brokerage" value={formatPaise(result.inputs.brokeragePaise)} />
                <ReceiptRow term="Buy turnover" value={formatPaise(result.turnoverBuyPaise)} />
                <ReceiptRow term="Sell turnover" value={formatPaise(result.turnoverSellPaise)} />
                <ReceiptRow term="Rate set" value={result.rateSetId} />
                <ReceiptRow term="Effective from" value={result.effectiveFrom} />
                <ReceiptRow term="Rounding" value={result.rounding} />
              </dl>
              <p className="type-caption pb-1 text-ink-muted">
                NSE cash market only (NSE/FA/73061, 1-Mar-2026). STT per Finance Act schedule;
                stamp duty per Indian Stamp Act; SEBI fee per current schedule; GST 18% on
                brokerage + NSE txn + SEBI (estimator assumption — IPFT excluded pending
                contract-note confirmation).
              </p>
              <p className="type-caption pb-1 text-ink-muted">
                Excluded: DP charges, slippage, penalties, account fees.
              </p>
              <p className="type-caption pb-2 text-ink-muted">
                Estimated transaction costs from rate set {result.rateSetId} and your brokerage
                assumption. Rounding may differ from your broker&apos;s contract note by a few
                paise. Verify before trading. Not investment advice.
              </p>
            </details>
          </Card>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="danger">
                {result.status === "unsupported" ? "Not supported" : "Cannot estimate"}
              </Badge>
              <span className="type-caption text-ink-muted">TC-001</span>
            </div>
            <p className="type-body mt-3">{result.reason}</p>
            {result.status === "unsupported" ? <UnsupportedDetails result={result} /> : null}
          </Card>
        )}
        <Callout title="Understand your trade before taking it" className="mt-6">
          TradeCost estimates the consequences of the numbers you enter. It does not predict
          profit, guarantee costs, or recommend trades.
        </Callout>
      </section>
    </div>
  );
}
