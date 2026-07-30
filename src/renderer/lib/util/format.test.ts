import { describe, it, expect } from "vitest";
import { formatUsd } from "./format.js";

describe("formatUsd", () => {
  it("formats with a dollar sign and two decimal places", () => {
    expect(formatUsd(12.3)).toBe("$12.30");
  });

  it("rounds to two decimal places", () => {
    expect(formatUsd(1.005)).toBe("$1.01");
  });

  it("formats zero", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });
});
