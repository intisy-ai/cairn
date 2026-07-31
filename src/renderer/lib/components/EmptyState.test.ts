// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import EmptyState from "./EmptyState.svelte";

describe("EmptyState", () => {
  it("renders the message", () => {
    const { getByText } = render(EmptyState, { props: { message: "Nothing here" } });
    expect(getByText("Nothing here")).toBeTruthy();
  });
  it("shows the CTA only when actionLabel and onAction are given and calls it", async () => {
    const onAction = vi.fn();
    const { getByRole, queryByRole, rerender } = render(EmptyState, { props: { message: "x" } });
    expect(queryByRole("button")).toBeNull();
    await rerender({ message: "x", actionLabel: "Do it", onAction });
    await fireEvent.click(getByRole("button", { name: "Do it" }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
