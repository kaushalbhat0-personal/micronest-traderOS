import { render, screen } from "@testing-library/react";
import { Clock3 } from "lucide-react";
import { describe, expect, it } from "vitest";

import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";

describe("Badge", () => {
  it("renders its label as text", () => {
    render(<Badge tone="primary">Most complete</Badge>);

    expect(screen.getByText("Most complete")).toBeInTheDocument();
  });

  it("keeps a decorative icon out of the accessible name", () => {
    const { container } = render(<Badge icon={Clock3}>First 100 customers</Badge>);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("First 100 customers")).toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it("communicates every status with words, not colour alone", () => {
    const { rerender } = render(<StatusBadge status="live" />);
    expect(screen.getByText("Live")).toBeInTheDocument();

    rerender(<StatusBadge status="coming_soon" />);
    expect(screen.getByText("Coming soon")).toBeInTheDocument();

    rerender(<StatusBadge status="planned" />);
    expect(screen.getByText("Planned")).toBeInTheDocument();
  });
});
