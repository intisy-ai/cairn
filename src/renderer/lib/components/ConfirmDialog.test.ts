// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import ConfirmDialog from "./ConfirmDialog.svelte";

const base = { title: "Remove?", message: "This cannot be undone.", onConfirm: vi.fn(), onCancel: vi.fn() };

describe("ConfirmDialog", () => {
  it("calls onConfirm when the confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    const { getByRole } = render(ConfirmDialog, { props: { ...base, confirmLabel: "Remove", onConfirm } });
    await fireEvent.click(getByRole("button", { name: "Remove" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel on Escape", async () => {
    const onCancel = vi.fn();
    const { getByRole } = render(ConfirmDialog, { props: { ...base, onCancel } });
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(getByRole("dialog")).toBeTruthy();
  });
});
