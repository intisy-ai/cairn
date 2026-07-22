import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function deployStubProvider(configDir: string): void {
  const repo = join(configDir, "repos", "stub-auth");
  mkdirSync(repo, { recursive: true });
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify({ claudeHub: { authProviders: [{ name: "stub", handler: "dist/index.js" }] } }),
  );
}

beforeEach(() => {
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-routing-"));
});

describe("routing sidecar module", () => {
  it("returns tiers and an empty catalog on a bare store", async () => {
    const { routingGet } = await import("./routing.js");
    const { anthropicProfile } = await import("@claude-code-proxy/index.js");

    const result = await routingGet("claude");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.tiers).toEqual(anthropicProfile().tierFallback);
    expect(result.data.catalog).toEqual([]);
    expect(result.data.map.default).toEqual([]);
  });

  it("persists a chain to a slot and clears it when set empty", async () => {
    const { routingGet, routingSetChain } = await import("./routing.js");
    deployStubProvider(process.env.HUB_CONFIG_DIR!);

    const set = await routingSetChain("claude", "opus", [{ provider: "stub", model: "m" }]);
    expect(set.ok).toBe(true);

    const afterSet = await routingGet("claude");
    if (!afterSet.ok) throw new Error("unreachable");
    expect(afterSet.data.map.opus).toEqual([{ provider: "stub", model: "m", name: "m", derived: false }]);

    const cleared = await routingSetChain("claude", "opus", []);
    expect(cleared.ok).toBe(true);

    const afterClear = await routingGet("claude");
    if (!afterClear.ok) throw new Error("unreachable");
    expect(afterClear.data.map.opus).toEqual([]);
  });

  it("routingGet errors for an app with no available proxy", async () => {
    const { routingGet } = await import("./routing.js");
    const r = await routingGet("nope");
    expect(r.ok).toBe(false);
  });

  it("routingSetChain rejects an unknown provider with ok:false", async () => {
    const { routingSetChain } = await import("./routing.js");
    const r = await routingSetChain("claude", "default", [{ provider: "does-not-exist", model: "x" }]);
    expect(r.ok).toBe(false);
  });
});
