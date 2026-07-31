// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import ErrorState from "./ErrorState.svelte";

describe("ErrorState", () => {
  it("renders the message", () => {
    const { getByRole } = render(ErrorState, { props: { message: "boom" } });
    expect(getByRole("alert").textContent).toContain("boom");
  });
  it("shows Retry only when onRetry given and calls it", async () => {
    const onRetry = vi.fn();
    const { getByRole, queryByRole, rerender } = render(ErrorState, { props: { message: "x" } });
    expect(queryByRole("button", { name: /retry/i })).toBeNull();
    await rerender({ message: "x", onRetry });
    await fireEvent.click(getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
