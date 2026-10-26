import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Disclaimer",
  description:
    "MicroNest Trader OS is a calculation and decision-support toolkit. It is not investment advice and does not provide recommendations.",
};

export default function DisclaimerPage() {
  return (
    <Container className="py-10 sm:py-12">
      <PageHeader
        eyebrow="Important"
        title="Disclaimer"
        description="Plain-language boundaries for what this product does and does not do."
      />

      <div className="mt-8 max-w-2xl space-y-8 text-sm leading-relaxed text-ink-muted">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">What this product is</h2>
          <p>
            MicroNest Trader OS is a set of calculation and decision-support tools for individual
            traders. You enter your own numbers, or data you choose to import, and the tools help
            you organise and check your thinking.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">What this product is not</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>It is not investment, trading, tax or legal advice.</li>
            <li>It is not a broker, exchange member, or order-routing system.</li>
            <li>It is not a signal service, tip provider, or portfolio manager.</li>
            <li>It is not a prediction engine and does not forecast prices.</li>
            <li>It does not tell you what to buy, sell, or hold.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">Calculations and estimates</h2>
          <p>
            Results depend entirely on the inputs you provide. Calculations may be rounded, and
            estimates such as charges can differ from what your broker or exchange actually applies.
            Verify inputs, contract specifications and applicable charges before trading.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">Market data</h2>
          <p>
            The initial product does not depend on live market data and does not connect to your
            broker. Where data is imported, it may be delayed, incomplete, or entered manually. Do
            not rely on it as a substitute for your broker’s records.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">Risk of loss</h2>
          <p>
            Trading and investing involve risk, including the loss of capital. Past results are not
            an indication of future outcomes. You are responsible for your own decisions and for
            assessing whether a trade is suitable for you.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">No guarantees</h2>
          <p>
            No result, calculation, or review produced by this product is guaranteed to be accurate,
            complete, or profitable. Using the product does not create an advisory or fiduciary
            relationship.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">Data and privacy</h2>
          <p>
            Phase 0 collects no personal or financial data, uses no analytics, and makes no external
            API calls. When accounts and saved data are introduced, their handling will be
            documented before launch. Partner payout details are not collected at all at this stage.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">Changes</h2>
          <p>
            The product, its calculations, and these boundaries will evolve. Material changes will
            be communicated before they take effect. Applicable regulatory disclosures will be
            published before any paid launch.
          </p>
        </section>
      </div>
    </Container>
  );
}
