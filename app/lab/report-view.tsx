import { FlaskConical } from "lucide-react";

import Link from "next/link";
import type { ReactNode } from "react";

import { formatINR, formatRatePercent } from "@/app/lab/format";
import type { StrategyLabReportOk } from "@/app/lab/report";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import type { LegMetrics, PartitionMetrics } from "@/features/strategy-lab/metrics";
import { cn } from "@/lib/utils";

/**
 * M1-F read-only research report — presentation over the frozen M1-E result.
 *
 * Formatting and layout only. Every figure below is read verbatim from
 * `report.research` (M1-E) or `report.referenceTrades` (M1-C records preserved
 * by M1-D). Nothing here calculates P&L, drawdown, expectancy, profit factor,
 * win rate, cost drag, partitions, or sensitivity.
 */

const EMPTY_SET = "No completed trades";

function formatExpectancy(metrics: PartitionMetrics): string {
  if (metrics.expectancy === null) {
    return EMPTY_SET;
  }
  return `${metrics.expectancy.decimal} paise per completed trade`;
}

function formatProfitFactor(metrics: PartitionMetrics): string {
  if (metrics.profitFactor === null) {
    return metrics.profitFactorNote === "no-losing-trades"
      ? "Undefined — no losing trades"
      : EMPTY_SET;
  }
  return `${metrics.profitFactor.decimal}×`;
}

function formatWinRate(metrics: PartitionMetrics): string {
  if (metrics.winRate === null) {
    return EMPTY_SET;
  }
  return formatRatePercent(metrics.winRate.decimal);
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="type-section">{children}</h2>;
}

function DefinitionList({ items }: { items: ReadonlyArray<{ term: string; value: string }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.term} className="min-w-0">
          <dt className="type-caption text-ink-muted">{item.term}</dt>
          <dd className="type-helper tnum mt-0.5 break-words text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const TABLE_WRAPPER = "overflow-x-auto rounded-xl border border-line bg-surface";
const TABLE = "w-full min-w-160 border-collapse text-left";
const TH =
  "type-caption border-b border-line px-4 py-3 font-medium whitespace-nowrap text-ink-muted";
const TD =
  "type-helper tnum border-b border-line px-4 py-3 whitespace-nowrap text-ink last:border-b-0";

function PartitionTable({ leg }: { leg: LegMetrics }) {
  const rows: ReadonlyArray<{ label: string; metrics: PartitionMetrics }> = [
    { label: "All", metrics: leg.all },
    { label: "IS", metrics: leg.is },
    { label: "OOS", metrics: leg.oos },
  ];
  return (
    <div className={TABLE_WRAPPER}>
      <table className={TABLE} aria-label="All, IS, and OOS metrics for the 5 bps reference leg">
        <caption className="sr-only">
          Net P&amp;L, drawdown, expectancy, profit factor, win rate, trade count, and cost drag for
          the All, IS, and OOS partitions of the 5 bps reference leg.
        </caption>
        <thead>
          <tr>
            <th scope="col" className={TH}>
              Partition
            </th>
            <th scope="col" className={TH}>
              Net P&amp;L
            </th>
            <th scope="col" className={TH}>
              Max drawdown
            </th>
            <th scope="col" className={TH}>
              Expectancy
            </th>
            <th scope="col" className={TH}>
              Profit factor
            </th>
            <th scope="col" className={TH}>
              Win rate
            </th>
            <th scope="col" className={TH}>
              Trades
            </th>
            <th scope="col" className={TH}>
              Cost drag
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className={cn(TD, "font-medium")}>
                {row.label}
              </th>
              <td className={TD}>{formatINR(row.metrics.netPnlPaise)}</td>
              <td className={TD}>{formatINR(row.metrics.maxDrawdownPaise)}</td>
              <td className={TD}>{formatExpectancy(row.metrics)}</td>
              <td className={TD}>{formatProfitFactor(row.metrics)}</td>
              <td className={TD}>{formatWinRate(row.metrics)}</td>
              <td className={TD}>{String(row.metrics.tradeCount)}</td>
              <td className={TD}>{formatINR(row.metrics.costDrag.totalPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SensitivityLegCard({ leg, reference }: { leg: LegMetrics; reference: boolean }) {
  const oos = leg.oos;
  return (
    <Card as="article" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="type-subtitle">{`${leg.slippageBps} bps`}</h3>
        {reference ? (
          <Badge tone="primary" icon={FlaskConical}>
            Reference
          </Badge>
        ) : null}
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3">
        {[
          { term: "OOS net P&L", value: formatINR(oos.netPnlPaise) },
          { term: "OOS max drawdown", value: formatINR(oos.maxDrawdownPaise) },
          { term: "OOS expectancy", value: formatExpectancy(oos) },
          { term: "OOS profit factor", value: formatProfitFactor(oos) },
          { term: "OOS win rate", value: formatWinRate(oos) },
          { term: "OOS completed trades", value: String(oos.tradeCount) },
          { term: "OOS cost drag", value: formatINR(oos.costDrag.totalPaise) },
        ].map((item) => (
          <div key={item.term} className="flex min-w-0 items-baseline justify-between gap-3">
            <dt className="type-caption shrink-0 text-ink-muted">{item.term}</dt>
            <dd className="type-helper tnum min-w-0 break-words text-right text-ink">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function StrategyLabReportView({ report }: { report: StrategyLabReportOk }) {
  const { manifest, strategy, research, referenceTrades } = report;
  const referenceLeg = research.legs[1] as LegMetrics;
  const headline = research.referenceOos;

  return (
    <Container className="py-10 sm:py-14">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary" icon={FlaskConical}>
          Research only
        </Badge>
      </div>
      <div className="mt-4">
        <PageHeader
          eyebrow="Research report"
          title="Strategy Lab"
          description="Deterministic historical research — not a trading signal"
        />
      </div>

      <Callout tone="warn" title="Synthetic fixture - not market evidence" className="mt-7">
        This report uses a synthetic fixture dataset. It is an engineering validation of the
        research pipeline, not evidence of real-market profitability.
      </Callout>

      <div className="mt-7">
        <Link href="/lab/operator" className={buttonClasses("secondary")}>
          Open the manual paper operator
        </Link>
      </div>

      <section aria-labelledby="slab-config" className="mt-10 space-y-4">
        <SectionHeading>
          <span id="slab-config">Research configuration</span>
        </SectionHeading>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card as="article" className="min-w-0">
            <h3 className="type-subtitle">Dataset</h3>
            <div className="mt-3">
              <DefinitionList
                items={[
                  { term: "Dataset ID", value: manifest.datasetId },
                  { term: "Version", value: manifest.version },
                  {
                    term: "Date range",
                    value: `${manifest.dateRange.start} to ${manifest.dateRange.end}`,
                  },
                  { term: "Symbol", value: manifest.universe.join(", ") },
                  { term: "Bar interval", value: manifest.barInterval },
                  { term: "Adjustment", value: manifest.adjustment },
                  { term: "Timezone", value: manifest.timezone },
                  { term: "Rows", value: String(manifest.rowCount) },
                ]}
              />
            </div>
          </Card>
          <Card as="article" className="min-w-0">
            <h3 className="type-subtitle">Strategy</h3>
            <div className="mt-3">
              <DefinitionList
                items={[
                  { term: "Strategy ID", value: strategy.id },
                  { term: "Strategy", value: strategy.name },
                  { term: "Version", value: strategy.version },
                  { term: "Fast period", value: String(strategy.params.fastPeriod) },
                  { term: "Slow period", value: String(strategy.params.slowPeriod) },
                  { term: "Stop lookback", value: String(strategy.params.stopLookback) },
                  { term: "Minimum bars", value: String(strategy.params.minBars) },
                  { term: "Quantity", value: `${String(strategy.quantity)} share per signal` },
                  {
                    term: "Brokerage",
                    value: `${formatINR(strategy.brokeragePaise)} per fill`,
                  },
                ]}
              />
            </div>
          </Card>
          <Card as="article" className="min-w-0">
            <h3 className="type-subtitle">Split</h3>
            <div className="mt-3">
              <DefinitionList
                items={[
                  { term: "Split ID", value: research.splitId },
                  { term: "Split date", value: research.splitDate },
                  { term: "IS", value: `entryDate < ${research.splitDate}` },
                  { term: "OOS", value: `entryDate >= ${research.splitDate}` },
                  {
                    term: "Crossing trades",
                    value:
                      "Whole trade stays in the partition determined by entry date — trades are never split, duplicated, or prorated.",
                  },
                ]}
              />
            </div>
          </Card>
        </div>
      </section>

      <section aria-labelledby="slab-headline" className="mt-10 space-y-4">
        <SectionHeading>
          <span id="slab-headline">OOS headline — 5 bps reference leg</span>
        </SectionHeading>
        <Card as="article" className="min-w-0">
          <p className="type-eyebrow text-ink-muted">OOS · 5 bps · reference leg</p>
          <Metric
            value={formatINR(headline.netPnlPaise)}
            caption="Net P&L of the out-of-sample partition at the frozen reference leg"
          />
          <div className="mt-5">
            <DefinitionList
              items={[
                { term: "Max drawdown", value: formatINR(headline.maxDrawdownPaise) },
                { term: "Expectancy", value: formatExpectancy(headline) },
                { term: "Profit factor", value: formatProfitFactor(headline) },
                { term: "Win rate", value: formatWinRate(headline) },
                { term: "Completed trades", value: String(headline.tradeCount) },
              ]}
            />
          </div>
          <p className="type-helper mt-5 text-ink-muted">
            5 bps is the pre-registered reference leg for reporting. Reference means fixed in
            advance for the report; it carries no ranking.
          </p>
        </Card>
      </section>

      <section aria-labelledby="slab-partitions" className="mt-10 space-y-4">
        <SectionHeading>
          <span id="slab-partitions">All / IS / OOS — 5 bps reference leg</span>
        </SectionHeading>
        <PartitionTable leg={referenceLeg} />
        <p className="type-helper text-ink-muted">
          {`IS = entryDate < ${research.splitDate}; OOS = entryDate >= ${research.splitDate}. Crossing trades remain whole in the partition determined by entry date.`}
        </p>
      </section>

      <section aria-labelledby="slab-sensitivity" className="mt-10 space-y-4">
        <SectionHeading>
          <span id="slab-sensitivity">Slippage sensitivity — OOS by leg</span>
        </SectionHeading>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {research.legs.map((leg) => (
            <SensitivityLegCard
              key={leg.slippageBps}
              leg={leg}
              reference={leg.slippageBps === research.referenceBps}
            />
          ))}
        </div>
        <p className="type-helper text-ink-muted">
          Legs are shown in fixed 0 / 5 / 10 bps order. The order carries no ranking, and no leg is
          marked as preferred.
        </p>
      </section>

      <section aria-labelledby="slab-trades" className="mt-10 space-y-4">
        <SectionHeading>
          <span id="slab-trades">Trade evidence — 5 bps reference leg</span>
        </SectionHeading>
        {referenceTrades.length === 0 ? (
          <Card className="min-w-0">
            <p className="type-helper text-ink-muted">
              No completed trades in the reference leg on this fixture. The table appears only when
              the frozen result carries trade records; nothing is estimated in its place.
            </p>
          </Card>
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE} aria-label="Completed trades of the 5 bps reference leg">
              <caption className="sr-only">
                Authoritative M1-C trade records of the 5 bps reference leg, shown verbatim.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Entry date
                  </th>
                  <th scope="col" className={TH}>
                    Exit date
                  </th>
                  <th scope="col" className={TH}>
                    Qty
                  </th>
                  <th scope="col" className={TH}>
                    Entry fill
                  </th>
                  <th scope="col" className={TH}>
                    Exit fill
                  </th>
                  <th scope="col" className={TH}>
                    Gross P&amp;L
                  </th>
                  <th scope="col" className={TH}>
                    Net P&amp;L
                  </th>
                  <th scope="col" className={TH}>
                    Exit reason
                  </th>
                  <th scope="col" className={TH}>
                    Forced exit
                  </th>
                </tr>
              </thead>
              <tbody>
                {referenceTrades.map((trade) => (
                  <tr key={`${trade.entryDate}-${trade.exitDate}`}>
                    <td className={TD}>{trade.entryDate}</td>
                    <td className={TD}>{trade.exitDate}</td>
                    <td className={TD}>{String(trade.quantity)}</td>
                    <td className={TD}>{formatINR(trade.entryFillPricePaise)}</td>
                    <td className={TD}>{formatINR(trade.exitFillPricePaise)}</td>
                    <td className={TD}>{formatINR(trade.grossPnlPaise)}</td>
                    <td className={TD}>{formatINR(trade.netPnlPaise)}</td>
                    <td className={cn(TD, "type-mono")}>{trade.exitReason}</td>
                    <td className={TD}>{trade.forcedExitAtEnd ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="slab-costs" className="mt-10 space-y-4">
        <SectionHeading>
          <span id="slab-costs">Cost drag — OOS · 5 bps</span>
        </SectionHeading>
        <Card as="article" className="min-w-0">
          <DefinitionList
            items={[
              {
                term: "Statutory costs",
                value: formatINR(headline.costDrag.statutoryPaise),
              },
              {
                term: "Slippage impact",
                value: formatINR(headline.costDrag.slippagePaise),
              },
              { term: "Total cost drag", value: formatINR(headline.costDrag.totalPaise) },
            ]}
          />
          <p className="type-helper mt-4 text-ink-muted">
            Reporting decomposition only. These amounts are already reflected in net P&amp;L and are
            not subtracted again; slippage is not a separate P&amp;L deduction.
          </p>
        </Card>
      </section>

      <section aria-labelledby="slab-limits" className="mt-10 space-y-4">
        <SectionHeading>
          <span id="slab-limits">Research limitations</span>
        </SectionHeading>
        <Card as="article" className="min-w-0">
          <ul className="type-helper list-disc space-y-2 pl-5 text-ink-muted">
            <li>Synthetic dataset — engineered fixture bars, not NSE market data.</li>
            <li>Single reference strategy with one fixed parameter set.</li>
            <li>No optimization and no parameter sweep.</li>
            <li>No live-market validation.</li>
            <li>No paper-trading validation.</li>
            <li>No broker execution validation.</li>
            <li>No claim of future profitability.</li>
            <li>
              The IS/OOS split exists to validate the research pipeline and partition semantics on
              the fixture. It is not evidence of a real market regime change.
            </li>
          </ul>
        </Card>
      </section>

      <Callout title="Scope" className="mt-10">
        This page presents the output of the deterministic research pipeline. It places no orders,
        connects to no broker, and offers no trading recommendations.
      </Callout>
    </Container>
  );
}
