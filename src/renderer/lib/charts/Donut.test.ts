// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import TestWrapper from "./Donut.test.svelte";

describe("Donut", () => {
  it("renders one slice path per non-zero slice and a legend", () => {
    const { container, getByText } = render(TestWrapper);
    expect(container.querySelectorAll("path.slice").length).toBe(2);
    expect(getByText("anthropic")).toBeInTheDocument();
    expect(getByText("75%")).toBeInTheDocument();
  });

  it("calls onselect from the legend", async () => {
    const clicked: string[] = [];
    const { container } = render(TestWrapper, { props: { clicked } });
    await fireEvent.click(container.querySelector("button.legend-row") as Element);
    expect(clicked).toEqual(["anthropic"]);
  });

  it("shows an empty state when every value is zero", () => {
    const { getByText } = render(TestWrapper, { props: { slices: [{ label: "a", value: 0, color: "#111" }] } });
    expect(getByText("Nothing to show")).toBeInTheDocument();
  });
});
