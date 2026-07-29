// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import TestWrapper from "./AreaChart.test.svelte";

describe("AreaChart", () => {
  it("renders one area path per series inside a responsive svg", () => {
    const { container } = render(TestWrapper);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 600 150");
    expect(container.querySelectorAll("path.area").length).toBe(2);
  });

  it("shows an empty state when there are no columns", () => {
    const { getByText } = render(TestWrapper, { props: { columns: [], series: [] } });
    expect(getByText("No usage in this range")).toBeInTheDocument();
  });
});
