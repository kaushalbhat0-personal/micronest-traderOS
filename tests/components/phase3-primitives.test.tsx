import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Field, ParsedValue, TextInput } from "@/components/ui/form-field";
import { Metric } from "@/components/ui/metric";
import { Receipt, ReceiptDisclaimer, ReceiptRow, ReceiptSection } from "@/components/ui/receipt";
import { ScenarioRow } from "@/components/ui/scenario-row";
import { WarningState } from "@/components/ui/warning-state";

describe("Metric", () => {
  it("renders a preformatted value with supporting text and caption", () => {
    render(<Metric value="₹929.51" supporting="net" caption="Model value" />);
    expect(screen.getByText("₹929.51")).toBeInTheDocument();
    expect(screen.getByText("net")).toBeInTheDocument();
    expect(screen.getByText("Model value")).toBeInTheDocument();
  });

  it("renders a bare value without optional lines", () => {
    render(<Metric value="500 units" />);
    expect(screen.getByText("500 units")).toBeInTheDocument();
  });
});

describe("WarningState", () => {
  it("announces the verbatim message via role=alert", () => {
    render(<WarningState message="Premium is below intrinsic value." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Premium is below intrinsic value.");
  });

  it("renders an optional title above the message", () => {
    render(<WarningState title="Check premium" message="Extrinsic value cannot be negative." />);
    expect(screen.getByText("Check premium")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("cannot be negative");
  });
});

describe("ScenarioRow", () => {
  it("renders label, markers, values and omission note", () => {
    render(
      <ScenarioRow
        label="Spot +5% · ₹105.00"
        ariaLabel="Spot 5% scenario"
        headingLevel="h4"
        markers={[
          { text: "Your inputs", tone: "primary" },
          { text: "ATM", tone: "neutral" },
        ]}
        note="omitted — V1 has a 1-day DTE floor"
      >
        <dl>
          <ReceiptRow term="Model value" value="₹2.54" />
        </dl>
      </ScenarioRow>,
    );
    expect(screen.getByLabelText("Spot 5% scenario")).toBeInTheDocument();
    expect(screen.getByText("Your inputs")).toBeInTheDocument();
    expect(screen.getByText("ATM")).toBeInTheDocument();
    expect(screen.getByText("₹2.54")).toBeInTheDocument();
    expect(screen.getByText("omitted — V1 has a 1-day DTE floor")).toBeInTheDocument();
  });

  it("renders without children for omitted rows", () => {
    render(<ScenarioRow label="−7 days" ariaLabel="Minus 7 day scenario" headingLevel="h4" />);
    expect(screen.getByLabelText("Minus 7 day scenario")).toBeInTheDocument();
  });
});

describe("Receipt", () => {
  it("groups rows into named sections under a stable summary", () => {
    render(
      <Receipt summary="Calculation receipt · RG-001">
        <ReceiptSection title="Inputs">
          <ReceiptRow term="Capital" value="₹1,00,000.00" />
        </ReceiptSection>
        <ReceiptSection title="Rounding">
          <ReceiptRow term="Rounding" value="Floor to lot size" />
        </ReceiptSection>
        <ReceiptDisclaimer>Not investment advice.</ReceiptDisclaimer>
      </Receipt>,
    );
    expect(screen.getByText("Calculation receipt · RG-001")).toBeInTheDocument();
    expect(screen.getByText("Inputs")).toBeInTheDocument();
    expect(screen.getAllByText("Rounding")).toHaveLength(2);
    expect(screen.getByText("Capital")).toBeInTheDocument();
    expect(screen.getByText("Not investment advice.")).toBeInTheDocument();
  });
});

describe("Field and TextInput", () => {
  it("keeps the label authoritative while the adornment stays hidden", () => {
    render(
      <Field id="f-capital" label="Capital (₹)" hint="Total capital.">
        <TextInput
          id="f-capital"
          name="capital"
          type="text"
          prefix="₹"
          value=""
          onChange={() => {}}
          aria-describedby="f-capital-hint"
        />
      </Field>,
    );
    expect(screen.getByLabelText("Capital (₹)")).toBeInTheDocument();
    const adornment = screen.getByText("₹", { selector: "span[aria-hidden='true']" });
    expect(adornment).toHaveAttribute("aria-hidden", "true");
  });

  it("shows the error with danger treatment and hides hint plus confirmation", () => {
    render(
      <Field
        id="f-risk"
        label="Risk %"
        hint="How much you accept losing."
        error="Risk % must be greater than zero."
        confirmation="Parsed as 2.50%"
      >
        <TextInput
          id="f-risk"
          name="risk"
          type="text"
          suffix="%"
          invalid
          value="0"
          onChange={() => {}}
        />
      </Field>,
    );
    expect(screen.getByText("Risk % must be greater than zero.")).toBeInTheDocument();
    expect(screen.queryByText("How much you accept losing.")).not.toBeInTheDocument();
    expect(screen.queryByText("Parsed as 2.50%")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Risk %")).toHaveClass("border-danger");
  });

  it("shows hint and parsed confirmation together when valid", () => {
    render(
      <Field id="f-entry" label="Entry (₹)" hint="Planned entry." confirmation="Parsed as ₹100.00">
        <TextInput
          id="f-entry"
          name="entry"
          type="text"
          prefix="₹"
          value="100"
          onChange={() => {}}
        />
      </Field>,
    );
    expect(screen.getByText("Planned entry.")).toBeInTheDocument();
    expect(screen.getByText("Parsed as ₹100.00")).toBeInTheDocument();
  });

  it("renders ParsedValue with muted styling", () => {
    render(<ParsedValue>Parsed as ₹100.00</ParsedValue>);
    expect(screen.getByText("Parsed as ₹100.00")).toHaveClass("text-ink-muted");
  });
});
