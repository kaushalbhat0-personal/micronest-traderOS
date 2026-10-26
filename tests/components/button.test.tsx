import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders a button with a safe default type and a 44px minimum target", () => {
    render(<Button>Calculate</Button>);

    const button = screen.getByRole("button", { name: "Calculate" });

    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("min-h-11");
  });

  it("exposes a disabled state", () => {
    render(<Button disabled>Not yet available</Button>);

    expect(screen.getByRole("button", { name: "Not yet available" })).toBeDisabled();
  });

  it("passes through an accessible name for icon-only usage", () => {
    render(
      <Button aria-label="Dismiss notice">
        <span aria-hidden="true">×</span>
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Dismiss notice" })).toBeInTheDocument();
  });
});
