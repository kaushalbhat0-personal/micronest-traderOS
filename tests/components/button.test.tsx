import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

describe("Button", () => {
  it("renders a button with a 44px minimum target and a safe default type", () => {
    render(<Button>Calculate</Button>);

    const button = screen.getByRole("button", { name: "Calculate" });

    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("min-h-11");
  });

  it("exposes a disabled state", () => {
    render(<Button disabled>Not yet available</Button>);

    expect(screen.getByRole("button", { name: "Not yet available" })).toBeDisabled();
  });
});

describe("StatusBadge", () => {
  it("communicates status with text, not colour alone", () => {
    render(<StatusBadge status="coming_soon" />);

    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });
});
