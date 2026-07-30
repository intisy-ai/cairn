// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import ViewToggle from "./ViewToggle.svelte";

describe("ViewToggle", () => {
  it("reflects the current value via aria-pressed and switches on click", async () => {
    const onChange = vi.fn();
    const { getByRole } = render(ViewToggle, { props: { value: "list", onChange } });
    const grid = getByRole("button", { name: /grid view/i });
    expect(getByRole("button", { name: /list view/i }).getAttribute("aria-pressed")).toBe("true");
    expect(grid.getAttribute("aria-pressed")).toBe("false");
    await fireEvent.click(grid);
    expect(onChange).toHaveBeenCalledWith("grid");
  });
});
