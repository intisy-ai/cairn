import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginHome } from "../../../packages/shared/src/domain.js";

// Simulate both optional engine repos being absent from this build: every dynamic
// import() the loaders below issue for these specifiers rejects, exactly like a
// missing sibling repo (ERR_MODULE_NOT_FOUND) or a broken one would.
vi.mock("@plugin-updater/config.js", () => {
  throw new Error("simulated: plugin-updater not installed");
});
vi.mock("@config-ledger/lib.js", () => {
  throw new Error("simulated: config-ledger not installed");
});

function fakeHome(id: string, dir: string): PluginHome {
  return { id, label: id, dir, present: true, hasUpdater: false };
}

describe("optionalEngines: both engines absent", () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "dash-optional-engines-"));
    const { resetOptionalEngineCacheForTests } = await import("./optionalEngines.js");
    resetOptionalEngineCacheForTests();
  });

  it("loadPluginUpdaterConfig and loadConfigLedger resolve to null instead of throwing", async () => {
    const { loadPluginUpdaterConfig, loadConfigLedger } = await import("./optionalEngines.js");
    expect(await loadPluginUpdaterConfig()).toBeNull();
    expect(await loadConfigLedger()).toBeNull();
  });

  it("safeGetPlugins degrades a read to an empty array", async () => {
    const { safeGetPlugins } = await import("./optionalEngines.js");
    expect(await safeGetPlugins(dir)).toEqual([]);
  });

  it("pluginsList degrades every present home to an empty row set", async () => {
    const { pluginsList } = await import("../modules/plugins.js");
    const res = await pluginsList({ homes: [fakeHome("claude", dir)] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0].rows).toEqual([]);
  });

  it("pluginsSetEnabled fails with a message naming the engine, not a misleading 'plugin not found'", async () => {
    const { pluginsSetEnabled } = await import("../modules/plugins.js");
    const res = await pluginsSetEnabled("claude", "some-plugin", true, { homes: [fakeHome("claude", dir)] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/plugin-updater is not available/);
    expect(res.error).not.toMatch(/plugin not found/);
  });

  it("configWrite fails with a message naming the engine, not a misleading 'plugin not found'", async () => {
    const { configWrite } = await import("../modules/appConfig.js");
    const res = await configWrite("claude", "some-plugin", "key", "value", { homes: [fakeHome("claude", dir)] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/plugin-updater is not available/);
    expect(res.error).not.toMatch(/plugin not found/);
  });

  it("ledgerHomes falls back to an empty view for every home via the real (unmocked) open path", async () => {
    const { ledgerHomes } = await import("../modules/ledger.js");
    const res = await ledgerHomes({ homes: async () => [fakeHome("claude", dir)] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0].snapshots).toEqual([]);
    expect(res.data[0].profiles).toEqual({ list: [], current: "" });
  });

  it("ledgerCommit fails with a message naming config-ledger via the real (unmocked) open path", async () => {
    const { ledgerCommit } = await import("../modules/ledger.js");
    const res = await ledgerCommit("claude", "manual", { homes: async () => [fakeHome("claude", dir)] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/config-ledger is not available/);
  });
});
