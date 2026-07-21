// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import QuotaBar from "./QuotaBar.svelte";

describe("QuotaBar", () => {
  it("renders a fill width derived from remainingFraction", () => {
    const { container } = render(QuotaBar, { props: { label: "weekly", remainingFraction: 0.32 } });
    const fill = container.querySelector(".bar i") as HTMLElement;
    expect(fill.style.width).toBe("68%");
  });

  it("colors the fill warn once usage crosses the threshold", () => {
    const { container } = render(QuotaBar, { props: { label: "rate", remainingFraction: 0.1 } });
    const fill = container.querySelector(".bar i") as HTMLElement;
    expect(fill.style.background).toContain("var(--warn)");
  });

  it("colors the fill good under the threshold", () => {
    const { container } = render(QuotaBar, { props: { label: "daily", remainingFraction: 0.6 } });
    const fill = container.querySelector(".bar i") as HTMLElement;
    expect(fill.style.background).toContain("var(--good)");
  });
});
