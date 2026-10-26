"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import {
  checkPlan,
  type TradePlanIncoherent,
  type TradePlanResult,
} from "@/features/trade-plan/trade-plan";
import {
  toTradePlanInput,
  tradePlanFieldsSchema,
  type TradePlanRawFields,
} from "@/features/trade-plan/validation";

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

const EMPTY_FIELDS: TradePlanRawFields = {
  direction: "long",
  entry: "",
  stop: "",
  target: "",
  setupName: "",
  thesis: "",
  invalidation: "",
  notes: "",
};

const INPUT_CLASS =
  "tnum min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-ink placeholder:text-ink-muted/70";
const TEXTAREA_CLASS =
  "min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-ink-muted/70";
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

function IncoherentDetails({ result }: { result: TradePlanIncoherent }) {
  return (
    <dl className="mt-4 divide-y divide-line border-t border-line">
      <ReceiptRow term="Direction" value={result.inputs.direction} />
      <ReceiptRow term="Entry" value={formatPaise(result.inputs.entryPaise)} />
      <ReceiptRow term="Stop-loss" value={formatPaise(result.inputs.stopPaise)} />
      {result.riskPerUnitPaise !== null ? (
        <ReceiptRow term="Per-unit risk" value={formatPaise(result.riskPerUnitPaise)} />
      ) : null}
    </dl>
  );
}

export function TradePlanChecker() {
  const [fields, setFields] = useState<TradePlanRawFields>(EMPTY_FIELDS);
  const [errors, setErrors] = useState<Partial<Record<keyof TradePlanRawFields, string>>>({});
  const [result, setResult] = useState<TradePlanResult | null>(null);
  const [announcement, setAnnouncement] = useState("");

  function setField(name: keyof TradePlanRawFields, value: string) {
    setFields((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = tradePlanFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof TradePlanRawFields, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof TradePlanRawFields | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setResult(null);
      setAnnouncement("Check the highlighted fields and try again.");
      return;
    }
    setErrors({});
    const decision = checkPlan(toTradePlanInput(parsed.data));
    setResult(decision);
    setAnnouncement(
      decision.status === "coherent"
        ? `Plan is coherent. Risk per unit ${formatPaise(decision.riskPerUnitPaise)}${decision.riskRewardRatio !== null ? `, reward to risk ${decision.riskRewardRatio.toFixed(2)} to 1` : ", no target so no reward to risk"}.`
        : `Plan is incoherent. ${decision.reason}`,
    );
  }

  const describe = (id: string, hint: boolean, hasError: boolean) =>
    hasError ? `${id}-error` : hint ? `${id}-hint` : undefined;

  // Ephemeral handoff: only direction/entry/stop/optional-target travel, as
  // plain query values. RiskGuard re-validates everything on arrival; no
  // narrative text (setup, thesis, invalidation, notes) ever enters the URL.
  function handoffHref(): string {
    const params = new URLSearchParams({
      direction: fields.direction,
      entry: fields.entry.trim(),
      stop: fields.stop.trim(),
    });
    if (fields.target.trim() !== "") params.set("target", fields.target.trim());
    return `/tools/risk-guard?${params.toString()}`;
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card as="section" aria-labelledby="trade-plan-inputs-heading">
        <h2 id="trade-plan-inputs-heading" className="type-section">
          Your plan
        </h2>
        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-6">
          <fieldset className="space-y-4">
            <legend className="type-eyebrow text-ink-muted">01 · Setup — what and why</legend>
            <div>
              <span id="tp-direction-label" className={LABEL_CLASS}>
                Direction
              </span>
              <div
                role="radiogroup"
                aria-labelledby="tp-direction-label"
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
                <p id="tp-direction-error" className={ERROR_CLASS}>
                  {errors.direction}
                </p>
              ) : null}
            </div>
            <Field
              id="tp-setup"
              label="Setup name"
              hint="One line, in your own words. E.g. Breakout retest."
              error={errors.setupName}
            >
              <input
                id="tp-setup"
                name="setupName"
                type="text"
                autoComplete="off"
                placeholder="Breakout retest"
                maxLength={80}
                value={fields.setupName}
                onChange={(event) => setField("setupName", event.target.value)}
                aria-invalid={Boolean(errors.setupName)}
                aria-describedby={describe("tp-setup", true, Boolean(errors.setupName))}
                className={`${INPUT_CLASS} mt-1.5 ${errors.setupName ? "border-danger" : ""}`}
              />
            </Field>
            <Field
              id="tp-thesis"
              label="Thesis"
              hint="Why this trade deserves your capital."
              error={errors.thesis}
            >
              <textarea
                id="tp-thesis"
                name="thesis"
                rows={3}
                maxLength={500}
                placeholder="Price reclaimed the level and held on a retest."
                value={fields.thesis}
                onChange={(event) => setField("thesis", event.target.value)}
                aria-invalid={Boolean(errors.thesis)}
                aria-describedby={describe("tp-thesis", true, Boolean(errors.thesis))}
                className={`${TEXTAREA_CLASS} mt-1.5 ${errors.thesis ? "border-danger" : ""}`}
              />
            </Field>
            <Field
              id="tp-invalidation"
              label="Invalidation"
              hint="Where is this plan wrong? State the condition."
              error={errors.invalidation}
            >
              <textarea
                id="tp-invalidation"
                name="invalidation"
                rows={2}
                maxLength={280}
                placeholder="A close back below the level."
                value={fields.invalidation}
                onChange={(event) => setField("invalidation", event.target.value)}
                aria-invalid={Boolean(errors.invalidation)}
                aria-describedby={describe("tp-invalidation", true, Boolean(errors.invalidation))}
                className={`${TEXTAREA_CLASS} mt-1.5 ${errors.invalidation ? "border-danger" : ""}`}
              />
            </Field>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="type-eyebrow text-ink-muted">
              02 · Trade levels — entry, wrong, target
            </legend>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-3 lg:grid-cols-1 xl:grid-cols-2">
              <Field
                id="tp-entry"
                label="Entry (₹)"
                hint="Your planned entry price."
                error={errors.entry}
              >
                <input
                  id="tp-entry"
                  name="entry"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="100"
                  value={fields.entry}
                  onChange={(event) => setField("entry", event.target.value)}
                  aria-invalid={Boolean(errors.entry)}
                  aria-describedby={describe("tp-entry", true, Boolean(errors.entry))}
                  className={`${INPUT_CLASS} mt-1.5 ${errors.entry ? "border-danger" : ""}`}
                />
              </Field>
              <Field
                id="tp-stop"
                label="Stop-loss (₹)"
                hint="Below entry for long, above for short."
                error={errors.stop}
              >
                <input
                  id="tp-stop"
                  name="stop"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="95"
                  value={fields.stop}
                  onChange={(event) => setField("stop", event.target.value)}
                  aria-invalid={Boolean(errors.stop)}
                  aria-describedby={describe("tp-stop", true, Boolean(errors.stop))}
                  className={`${INPUT_CLASS} mt-1.5 ${errors.stop ? "border-danger" : ""}`}
                />
              </Field>
            </div>
            <Field
              id="tp-target"
              label="Target (₹)"
              hint="Leave blank if you have no target. R:R is only shown with a target."
              error={errors.target}
            >
              <input
                id="tp-target"
                name="target"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Optional"
                value={fields.target}
                onChange={(event) => setField("target", event.target.value)}
                aria-invalid={Boolean(errors.target)}
                aria-describedby={describe("tp-target", true, Boolean(errors.target))}
                className={`${INPUT_CLASS} mt-1.5 ${errors.target ? "border-danger" : ""}`}
              />
            </Field>
            <Field
              id="tp-notes"
              label="Notes (optional)"
              hint="Anything else the plan depends on."
              error={errors.notes}
            >
              <textarea
                id="tp-notes"
                name="notes"
                rows={2}
                maxLength={500}
                placeholder="Optional"
                value={fields.notes}
                onChange={(event) => setField("notes", event.target.value)}
                aria-invalid={Boolean(errors.notes)}
                aria-describedby={describe("tp-notes", true, Boolean(errors.notes))}
                className={`${TEXTAREA_CLASS} mt-1.5 ${errors.notes ? "border-danger" : ""}`}
              />
            </Field>
          </fieldset>

          <Button type="submit" className="w-full sm:w-auto">
            Check my plan
          </Button>
        </form>
      </Card>

      <section aria-labelledby="trade-plan-result-heading" aria-live="polite">
        <h2 id="trade-plan-result-heading" className="sr-only">
          Result
        </h2>
        <p className="sr-only">{announcement}</p>
        {result === null ? (
          <Card>
            <h3 className="type-subtitle">Your decision check will appear here</h3>
            <p className="type-helper mt-1.5 text-ink-muted">
              Describe the setup, set the levels, then check. The tool verifies the plan is
              internally coherent — it never recommends what to buy or sell.
            </p>
          </Card>
        ) : result.status === "coherent" ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="ok">Coherent plan</Badge>
              <span className="type-caption text-ink-muted">TP-001</span>
            </div>
            <h3 className="type-subtitle mt-4">03 · Risk / reward</h3>
            {result.riskRewardRatio !== null && result.rewardPerUnitPaise !== null ? (
              <p className="type-metric tnum mt-1">
                {result.riskRewardRatio.toFixed(2)}{" "}
                <span className="type-helper text-ink-muted">
                  reward : risk · {formatPaise(result.rewardPerUnitPaise)} reward per unit
                </span>
              </p>
            ) : (
              <p className="type-metric tnum mt-1">
                {formatPaise(result.riskPerUnitPaise)}{" "}
                <span className="type-helper text-ink-muted">
                  risk per unit · no target, so no R:R
                </span>
              </p>
            )}
            <dl className="mt-4 divide-y divide-line border-t border-line">
              <ReceiptRow term="Direction" value={result.inputs.direction} />
              <ReceiptRow term="Entry" value={formatPaise(result.inputs.entryPaise)} />
              <ReceiptRow term="Stop-loss" value={formatPaise(result.inputs.stopPaise)} />
              <ReceiptRow term="Per-unit risk" value={formatPaise(result.riskPerUnitPaise)} />
              {result.inputs.targetPaise !== undefined &&
              result.rewardPerUnitPaise !== null ? (
                <>
                  <ReceiptRow term="Target" value={formatPaise(result.inputs.targetPaise)} />
                  <ReceiptRow
                    term="Per-unit reward"
                    value={formatPaise(result.rewardPerUnitPaise)}
                  />
                </>
              ) : null}
            </dl>
            <h3 className="type-subtitle mt-5">04 · Decision check</h3>
            <p className="type-helper mt-1.5 text-ink-muted">
              The plan is internally coherent: the stop sits on the loss side of entry
              {result.inputs.targetPaise !== undefined
                ? ", the target sits on the profit side, and the arithmetic above follows."
                : ", and the arithmetic above follows. No target was given, so no R:R is calculated."}
            </p>
            <h3 className="type-subtitle mt-5">Next decision</h3>
            <p className="type-helper mt-1.5 text-ink-muted">
              A coherent plan is not automatically a responsibly sized one. RiskGuard will now
              check how much you can take under your own risk constraint.
            </p>
            <a
              href={handoffHref()}
              className={buttonClasses("primary", "mt-3 w-full sm:w-auto")}
            >
              Size this trade in RiskGuard
            </a>
            <details className="mt-4 rounded-lg border border-line bg-surface-muted/50 px-4 py-2">
              <summary className="type-label inline-flex min-h-11 cursor-pointer items-center text-ink">
                05 · Plan receipt · TP-001
              </summary>
              <dl className="divide-y divide-line border-t border-line pb-2">
                <ReceiptRow term="Setup" value={result.inputs.setupName} />
                <ReceiptRow term="Thesis" value={result.inputs.thesis} />
                <ReceiptRow term="Invalidation" value={result.inputs.invalidation} />
                {result.inputs.notes !== undefined ? (
                  <ReceiptRow term="Notes" value={result.inputs.notes} />
                ) : null}
                <ReceiptRow term="Risk per unit" value={formatPaise(result.riskPerUnitPaise)} />
                <ReceiptRow
                  term="Reward per unit"
                  value={
                    result.rewardPerUnitPaise !== null
                      ? formatPaise(result.rewardPerUnitPaise)
                      : "Not calculated — no target"
                  }
                />
                <ReceiptRow
                  term="R:R"
                  value={
                    result.riskRewardRatio !== null
                      ? `${result.riskRewardRatio.toFixed(2)} : 1`
                      : "Not calculated — no target"
                  }
                />
                <ReceiptRow term="Rounding" value={result.rounding} />
              </dl>
              <p className="type-caption pb-2 text-ink-muted">
                Charges and slippage are excluded. Verify with your broker. Not investment advice.
              </p>
            </details>
          </Card>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="danger">Plan incoherent</Badge>
              <span className="type-caption text-ink-muted">TP-001</span>
            </div>
            <h3 className="type-subtitle mt-4">04 · Decision check</h3>
            <p className="type-body mt-1.5">{result.reason}</p>
            <IncoherentDetails result={result} />
            <details className="mt-4 rounded-lg border border-line bg-surface-muted/50 px-4 py-2">
              <summary className="type-label inline-flex min-h-11 cursor-pointer items-center text-ink">
                05 · Plan receipt · TP-001
              </summary>
              <dl className="divide-y divide-line border-t border-line pb-2">
                <ReceiptRow term="Setup" value={result.inputs.setupName} />
                <ReceiptRow term="Direction" value={result.inputs.direction} />
                <ReceiptRow term="Entry" value={formatPaise(result.inputs.entryPaise)} />
                <ReceiptRow term="Stop-loss" value={formatPaise(result.inputs.stopPaise)} />
                <ReceiptRow term="Rounding" value={result.rounding} />
              </dl>
              <p className="type-caption pb-2 text-ink-muted">
                Charges and slippage are excluded. Verify with your broker. Not investment advice.
              </p>
            </details>
          </Card>
        )}
        <Callout title="Understand your trade before taking it" className="mt-6">
          TradePlan checks the coherence of the plan you describe. It does not predict prices,
          generate signals, or recommend trades.
        </Callout>
      </section>
    </div>
  );
}
