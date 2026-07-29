// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { reducedMotion, fadeMotion, flyMotion } from "./motion.js";

function setReduced(matches: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("motion", () => {
  it("reducedMotion reflects matchMedia", () => {
    setReduced(true);
    expect(reducedMotion()).toBe(true);
    setReduced(false);
    expect(reducedMotion()).toBe(false);
  });

  it("fadeMotion and flyMotion no-op under reduced motion", () => {
    setReduced(true);
    const el = document.createElement("div");
    expect(fadeMotion(el).duration).toBe(0);
    expect(flyMotion(el).duration).toBe(0);
  });

  it("fadeMotion and flyMotion animate when motion is allowed", () => {
    setReduced(false);
    const el = document.createElement("div");
    expect(fadeMotion(el).duration).toBeGreaterThan(0);
    expect(flyMotion(el).duration).toBeGreaterThan(0);
  });
});
