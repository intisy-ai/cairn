import { describe, it, expect } from "vitest";
import { shouldAutostart } from "./autostart.js";

describe("shouldAutostart", () => {
  it("is true only when proxyAutostart is exactly true", () => {
    expect(shouldAutostart({ proxyAutostart: true })).toBe(true);
  });

  it("is false when proxyAutostart is false, absent, or the wrong type", () => {
    expect(shouldAutostart({ proxyAutostart: false })).toBe(false);
    expect(shouldAutostart({})).toBe(false);
    expect(shouldAutostart({ proxyAutostart: "true" })).toBe(false);
  });

  it("is false for non-object input", () => {
    expect(shouldAutostart(null)).toBe(false);
    expect(shouldAutostart(undefined)).toBe(false);
    expect(shouldAutostart("nope")).toBe(false);
    expect(shouldAutostart(42)).toBe(false);
  });
});
