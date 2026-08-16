// Proves the install flow against throwaway homes, exercising the DEFAULT wiring that
// unit tests replace with injected seams. That is the class of bug this flow has hit
// twice, so it gets a live check: real clones, real registration, real activity records.
//
// Not part of the normal suite (the filename does not end in .test.ts, which is what
// vitest.config.ts includes). Run it deliberately:
//   npx vitest run --config vitest.live.config.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginHome } from "../../../packages/shared/src/domain.js";
import { reposDir, pluginDir } from "../lib/storagePaths.js";

const CLONE_TIMEOUT_MS = 300_000;

let root: string;
let homes: PluginHome[];
let manager: { id: string; url: string };

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "cairn-install-flow-"));
  homes = [
    { id: "cairn", label: "Cairn", dir: join(root, "cairn"), present: true, hasUpdater: false },
    { id: "claude", label: "Claude Code", dir: join(root, "claude"), present: true, hasUpdater: false },
    { id: "opencode", label: "OpenCode", dir: join(root, "opencode"), present: true, hasUpdater: false },
  ];
  // Every ambient resolution must land inside the temp root, never a real home.
  process.env.HUB_CONFIG_DIR = homes[0].dir;

  const { repoProvidingCapability } = await import("../lib/capabilityCatalog.js");
  const found = await repoProvidingCapability(homes[0].dir, "plugin-management");
  if (!found) throw new Error("no marketplace source offers a plugin providing plugin-management");
  manager = { id: found.id, url: found.url };
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

// syncPluginsAcrossApps is the one seam still injected: the real one reconciles
// plugins.json across the machine's REAL app homes, which a test must never touch.
async function installManager(homeId: string): Promise<{ ok: boolean; error?: string }> {
  const { pluginsInstall } = await import("../modules/plugins.js");
  return pluginsInstall(homeId as never, manager.id, manager.url, {
    homes,
    syncPluginsAcrossApps: async () => {},
  });
}

describe.each(["claude", "opencode"])("installing the plugin manager into the %s home", (homeId) => {
  it("really installs it and then reports it as installed", async () => {
    const home = homes.find((h) => h.id === homeId)!;
    const result = await installManager(homeId);
    expect(result.ok, result.ok ? "" : String(result.error)).toBe(true);

    expect(existsSync(join(reposDir(home.dir), manager.id)), "clone exists").toBe(true);
    expect(existsSync(join(pluginDir(home.dir), `${manager.id}.js`)), "bundle deployed").toBe(true);

    const registered = JSON.parse(readFileSync(join(home.dir, "config", "plugins.json"), "utf8")) as Array<{ name: string }>;
    expect(registered.some((p) => p.name === manager.id), "registered in plugins.json").toBe(true);

    // The bug this whole change exists to fix: the home used to report false here.
    const { updaterInstalled } = await import("../lib/pluginHomes.js");
    expect(await updaterInstalled(home.dir), "home reports the manager as installed").toBe(true);
  }, CLONE_TIMEOUT_MS);
});

describe("the app's own registration", () => {
  it("writes a hook for a hook-style app and a plugin entry for an opencode-style one", () => {
    const claudeSettings = join(root, "claude", "settings.json");
    expect(existsSync(claudeSettings)).toBe(true);
    expect(readFileSync(claudeSettings, "utf8")).toContain(manager.id);

    const opencodeConfig = join(root, "opencode", "opencode.json");
    expect(existsSync(opencodeConfig)).toBe(true);
    expect(readFileSync(opencodeConfig, "utf8")).toContain(manager.id);
  });
});

describe("the activity chain", () => {
  it("records the request and chains what followed to it", () => {
    const busPath = join(root, "cairn", "events", "bus.jsonl");
    expect(existsSync(busPath), "an activity log was written").toBe(true);
    const records = readFileSync(busPath, "utf8").trim().split("\n").filter(Boolean)
      .map((line) => JSON.parse(line) as { id: string; payload: { action?: string; trace?: { id?: string; causedBy?: string } } });

    const requested = records.filter((r) => r.payload?.action === "plugin_install_requested");
    expect(requested.length, "one request record per install").toBe(2);

    for (const request of requested) {
      const traceId = request.payload.trace?.id;
      expect(traceId, "the request carries a trace").toBeTruthy();
      const sameTrace = records.filter((r) => r.payload?.trace?.id === traceId && r.id !== request.id);
      // Everything else in this trace must chain back to the request, directly or not.
      const ids = new Set([request.id, ...sameTrace.map((r) => r.id)]);
      for (const follower of sameTrace) {
        expect(ids.has(follower.payload.trace?.causedBy ?? ""), `${follower.id} chains inside its own trace`).toBe(true);
      }
    }
  });
});
