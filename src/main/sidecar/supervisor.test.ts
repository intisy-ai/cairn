import { describe, it, expect } from "vitest";
import { buildSidecarEnv, computeBackoffMs, shouldGiveUp } from "./supervisor.js";
describe("buildSidecarEnv", () => {
  it("sets HUB_CONFIG_DIR to the dashboard store dir", () => {
    const env = buildSidecarEnv({ PATH: "/x" }, "/store/intisy");
    expect(env.HUB_CONFIG_DIR).toBe("/store/intisy");
    expect(env.PATH).toBe("/x");
  });
});

describe("computeBackoffMs", () => {
  it("increases with each attempt", () => {
    expect(computeBackoffMs(0)).toBe(200);
    expect(computeBackoffMs(1)).toBe(400);
    expect(computeBackoffMs(2)).toBe(800);
    expect(computeBackoffMs(3)).toBe(1600);
  });

  it("caps at 5000ms", () => {
    expect(computeBackoffMs(10)).toBe(5000);
    expect(computeBackoffMs(20)).toBe(5000);
  });
});

describe("shouldGiveUp", () => {
  it("is false while under the cap", () => {
    expect(shouldGiveUp(0)).toBe(false);
    expect(shouldGiveUp(4)).toBe(false);
  });

  it("is true once the attempt reaches the cap", () => {
    expect(shouldGiveUp(5)).toBe(true);
    expect(shouldGiveUp(6)).toBe(true);
  });

  it("honors a custom cap", () => {
    expect(shouldGiveUp(2, 3)).toBe(false);
    expect(shouldGiveUp(3, 3)).toBe(true);
  });
});
