import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Reveal } from "@/components/ui/reveal";

type ObserverCallback = (
  entries: Array<{ isIntersecting: boolean }>,
  observer: { disconnect: () => void },
) => void;

function mockIntersectionObserver() {
  const observed: Element[] = [];
  const disconnect = vi.fn();
  let callback: ObserverCallback | null = null;
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  class MockObserver {
    constructor(cb: ObserverCallback) {
      callback = cb;
    }
    observe = (element: Element) => {
      observed.push(element);
    };
    unobserve = vi.fn();
    disconnect = disconnect;
  }
  vi.stubGlobal("IntersectionObserver", MockObserver);
  return {
    observed,
    disconnect,
    intersect() {
      callback?.([{ isIntersecting: true }], { disconnect });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Reveal", () => {
  it("renders hidden until the block intersects, then reveals once", async () => {
    const io = mockIntersectionObserver();
    render(<Reveal>Hero copy</Reveal>);

    const block = screen.getByText("Hero copy").closest("[data-reveal]");
    expect(block).not.toBeNull();
    expect(block).not.toHaveAttribute("data-visible");
    expect(io.observed).toHaveLength(1);

    io.intersect();
    await act(async () => {});
    expect(screen.getByText("Hero copy").closest("[data-reveal]")).toHaveAttribute("data-visible");
    expect(io.disconnect).toHaveBeenCalled();
  });

  it("renders visible immediately without IntersectionObserver", () => {
    render(<Reveal>Static copy</Reveal>);
    expect(screen.getByText("Static copy").closest("[data-reveal]")).toHaveAttribute(
      "data-visible",
    );
  });

  it("applies the tier and caps stagger delays", () => {
    mockIntersectionObserver();
    render(
      <Reveal tier="micro" delay={9000}>
        Micro copy
      </Reveal>,
    );
    const block = screen.getByText("Micro copy").closest("[data-reveal]");
    expect(block?.getAttribute("data-reveal")).toBe("micro");
    expect(block).toHaveStyle({ transitionDelay: "300ms" });
  });

  it("renders semantic list items when asked", () => {
    mockIntersectionObserver();
    render(
      <ul>
        <Reveal as="li">Step one</Reveal>
      </ul>,
    );
    expect(screen.getByText("Step one").tagName).toBe("LI");
  });
});
