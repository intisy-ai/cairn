// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/svelte";
import { get } from "svelte/store";
import { toasts, toast } from "../toast.js";
import ToastHost from "./ToastHost.svelte";

describe("ToastHost", () => {
  beforeEach(() => { get(toasts).slice().forEach((t) => toast.dismiss(t.id)); vi.useFakeTimers(); });

  it("renders success as status and error as alert, and dismisses on close", async () => {
    const { findByRole, getByRole } = render(ToastHost);
    toast.success("saved");
    const status = await findByRole("status");
    expect(status.textContent).toContain("saved");
    toast.error("boom");
    expect(getByRole("alert").textContent).toContain("boom");
    await fireEvent.click(within(status).getByRole("button", { name: /dismiss/i }));
    expect(status.isConnected).toBe(false);
  });
});
