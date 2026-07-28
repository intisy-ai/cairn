// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import TestWrapper from "./BarChart.test.svelte";

describe("BarChart", () => {
  it("renders ranked rows and marks the selected one pressed", () => {
    const { container, getByText } = render(TestWrapper, { props: { selected: "opus" } });
    const rows = container.querySelectorAll("button.bar-row");
    expect(rows.length).toBe(2);
    expect(getByText("sonnet")).toBeInTheDocument();
    const pressed = Array.from(rows).filter((r) => r.getAttribute("aria-pressed") === "true");
    expect(pressed.length).toBe(1);
  });

  it("calls onselect with the row label when clicked", async () => {
    const clicked: string[] = [];
    const { container } = render(TestWrapper, { props: { clicked } });
    await fireEvent.click(container.querySelector("button.bar-row") as Element);
    expect(clicked).toEqual(["sonnet"]);
  });

  it("shows an empty state when there are no positive-value bars", () => {
    const { getByText } = render(TestWrapper, { props: { items: [] } });
    expect(getByText("Nothing to show")).toBeInTheDocument();
  });
});
