import { describe, it, expect } from "vitest";
import { buildSidecarEnv } from "./supervisor.js";
describe("buildSidecarEnv", () => {
  it("sets HUB_CONFIG_DIR to the dashboard store dir", () => {
    const env = buildSidecarEnv({ PATH: "/x" }, "/store/intisy");
    expect(env.HUB_CONFIG_DIR).toBe("/store/intisy");
    expect(env.PATH).toBe("/x");
  });
});
