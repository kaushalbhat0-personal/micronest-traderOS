import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card } from "@/components/ui/card";

describe("Card", () => {
  it("renders a plain surface by default", () => {
    const { container } = render(<Card>Body</Card>);

    expect(container.firstElementChild?.tagName).toBe("DIV");
  });

  it("can render as a named article so a plan reads as a self-contained offer", () => {
    render(
      <Card as="article" aria-labelledby="plan-name">
        <h2 id="plan-name">All Access</h2>
      </Card>,
    );

    expect(screen.getByRole("article", { name: "All Access" })).toBeInTheDocument();
  });

  it("can render as a labelled section region", () => {
    render(
      <Card as="section" aria-labelledby="founding">
        <h2 id="founding">Founding offer</h2>
      </Card>,
    );

    expect(screen.getByRole("region", { name: "Founding offer" })).toBeInTheDocument();
  });
});
