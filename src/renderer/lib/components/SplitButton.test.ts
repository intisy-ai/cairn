// @vitest-environment jsdom
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import SplitButton from "./SplitButton.svelte";

describe("SplitButton", () => {
  it("calls onPrimary when the primary button is clicked", async () => {
    const onPrimary = vi.fn();
    const { getByText } = render(SplitButton, { props: { label: "Install", onPrimary } });
    await fireEvent.click(getByText("Install"));
    expect(onPrimary).toHaveBeenCalledOnce();
  });

  it("toggles the menu via the caret and reflects aria-expanded", async () => {
    const { getByLabelText } = render(SplitButton, { props: { label: "Install" } });
    const caret = getByLabelText("More install options");
    expect(caret.getAttribute("aria-expanded")).toBe("false");
    await fireEvent.click(caret);
    expect(caret.getAttribute("aria-expanded")).toBe("true");
  });
});
