import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { get } from "svelte/store";
import { toasts, toast } from "./toast.js";

describe("toast store", () => {
  beforeEach(() => { get(toasts).slice().forEach((t) => toast.dismiss(t.id)); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it("success and error push a toast with the right kind", () => {
    toast.success("ok"); toast.error("bad");
    const list = get(toasts);
    expect(list.map((t) => [t.kind, t.message])).toEqual([["success", "ok"], ["error", "bad"]]);
  });

  it("dismiss removes by id", () => {
    toast.success("x");
    const id = get(toasts)[0].id;
    toast.dismiss(id);
    expect(get(toasts)).toHaveLength(0);
  });

  it("auto-dismisses after the timeout", () => {
    toast.success("x");
    expect(get(toasts)).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(get(toasts)).toHaveLength(0);
  });
});
