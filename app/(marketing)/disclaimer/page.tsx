import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Callout } from "@/components/ui/callout";

export const metadata: Metadata = {
  title: "Disclaimer",
  description:
    "MicroNest Trader OS is a calculation and decision-support toolkit. It is not investment advice and does not provide recommendations.",
};

/** Local to this page: the same heading + prose pattern, eight times over. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="type-section">{title}</h2>
      <div className="type-body space-y-2 text-ink-muted">{children}</div>
    </section>
  );
}

export default function DisclaimerPage() {
  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Important"
        title="Disclaimer"
        description="Plain-language boundaries for what this product does and does not do."
      />

      <div className="mt-8 max-w-2xl space-y-8">
        <Callout title="The short version">
          Calculations and analysis tools only. Not investment advice. Verify inputs and applicable
          charges before trading.
        </Callout>

        <Section title="What this product is">
          <p>
            MicroNest Trader OS is a set of calculation and decision-support tools for individual
            traders. You enter your own numbers, or data you choose to import, and the tools help
            you organise and check your thinking.
          </p>
        </Section>

        <Section title="What this product is not">
          <ul className="list-disc space-y-1 pl-5">
            <li>It is not investment, trading, tax or legal advice.</li>
            <li>It is not a broker, exchange member, or order-routing system.</li>
            <li>It is not a signal service, tip provider, or portfolio manager.</li>
            <li>It is not a prediction engine and does not forecast prices.</li>
            <li>It does not tell you what to buy, sell, or hold.</li>
          </ul>
        </Section>

        <Section title="Calculations and estimates">
          <p>
            Results depend entirely on the inputs you provide. Calculations may be rounded, and
            estimates such as charges can differ from what your broker or exchange actually applies.
            Verify inputs, contract specifications and applicable charges before trading.
          </p>
        </Section>

        <Section title="Market data">
          <p>
            The initial product does not depend on live market data and does not connect to your
            broker. Where data is imported, it may be delayed, incomplete, or entered manually. Do
            not rely on it as a substitute for your broker’s records.
          </p>
        </Section>

        <Section title="Risk of loss">
          <p>
            Trading and investing involve risk, including the loss of capital. Past results are not
            an indication of future outcomes. You are responsible for your own decisions and for
            assessing whether a trade is suitable for you.
          </p>
        </Section>

        <Section title="No guarantees">
          <p>
            No result, calculation, or review produced by this product is guaranteed to be accurate,
            complete, or profitable. Using the product does not create an advisory or fiduciary
            relationship.
          </p>
        </Section>

        <Section title="Data and privacy">
          <p>
            This build collects no personal or financial data, uses no analytics, and makes no
            external API calls. When accounts and saved data are introduced, their handling will be
            documented before launch. Partner payout details are not collected at all at this stage.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            The product, its calculations, and these boundaries will evolve. Material changes will
            be communicated before they take effect. Applicable regulatory disclosures will be
            published before any paid launch.
          </p>
        </Section>

        <p className="type-caption text-ink-muted">Last reviewed: 27 October 2026.</p>
      </div>
    </Container>
  );
}
