import { describe, it, expect, vi } from "vitest";
import { debounce } from "./debounce.js";

describe("debounce", () => {
  it("fires once after the quiet window with the latest args", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const d = debounce(spy, 100);
    d("a"); d("b"); d("c");
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("c");
    vi.useRealTimers();
  });

  it("cancel prevents a pending call", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const d = debounce(spy, 100);
    d("x"); d.cancel();
    vi.advanceTimersByTime(200);
    expect(spy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
