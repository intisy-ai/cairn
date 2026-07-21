import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

beforeEach(() => {
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-routing-"));
});

describe("routing sidecar module", () => {
  it("returns tiers and an empty catalog on a bare store", async () => {
    const { routingGet } = await import("./routing.js");
    const { anthropicProfile } = await import("@claude-code-proxy/index.js");

    const result = await routingGet();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.tiers).toEqual(anthropicProfile().tierFallback);
    expect(result.data.catalog).toEqual([]);
    expect(result.data.map.default).toEqual([]);
  });

  it("persists a chain to a slot and clears it when set empty", async () => {
    const { routingGet, routingSetChain } = await import("./routing.js");

    const set = await routingSetChain("opus", [{ provider: "stub", model: "m" }]);
    expect(set.ok).toBe(true);

    const afterSet = await routingGet();
    if (!afterSet.ok) throw new Error("unreachable");
    expect(afterSet.data.map.opus).toEqual([{ provider: "stub", model: "m", name: "m", derived: false }]);

    const cleared = await routingSetChain("opus", []);
    expect(cleared.ok).toBe(true);

    const afterClear = await routingGet();
    if (!afterClear.ok) throw new Error("unreachable");
    expect(afterClear.data.map.opus).toEqual([]);
  });
});
