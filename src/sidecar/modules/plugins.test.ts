import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAppConfigDir, getAppName } from "@plugin-updater/env.js";
import { isMandatoryEngine } from "@core/index.js";
import type { Plugin } from "@plugin-updater/types.js";
import type { UpdateCache } from "@plugin-updater/cache.js";
import type { PluginHome } from "../../../packages/shared/src/domain.js";

let cairnDir: string;
let claudeDir: string;
let opencodeDir: string;
let fakeHomes: PluginHome[];

beforeEach(() => {
  cairnDir = mkdtempSync(join(tmpdir(), "dash-plugins-cairn-"));
  claudeDir = mkdtempSync(join(tmpdir(), "dash-plugins-claude-"));
  opencodeDir = mkdtempSync(join(tmpdir(), "dash-plugins-opencode-"));
  mkdirSync(join(cairnDir, "config"), { recursive: true });
  mkdirSync(join(claudeDir, "config"), { recursive: true });
  mkdirSync(join(opencodeDir, "config"), { recursive: true });
  process.env.HUB_CONFIG_DIR = cairnDir;
  fakeHomes = [
    { id: "cairn", label: "Cairn", dir: cairnDir, present: true, hasUpdater: true },
    { id: "claude", label: "Claude Code", dir: claudeDir, present: true, hasUpdater: true },
    { id: "opencode", label: "OpenCode", dir: opencodeDir, present: true, hasUpdater: false },
  ];
});

function seedPlugins(dir: string, entries: Plugin[]): void {
  writeFileSync(join(dir, "config", "plugins.json"), JSON.stringify(entries, null, 2), "utf8");
}

function seedNpmPlugins(dir: string, names: string[]): void {
  writeFileSync(join(dir, "opencode.json"), JSON.stringify({ plugin: names }, null, 2), "utf8");
}

function seedCache(dir: string, cache: UpdateCache): void {
  mkdirSync(join(dir, "cache"), { recursive: true });
  writeFileSync(join(dir, "cache", "plugin-updates.json"), JSON.stringify(cache, null, 2), "utf8");
}

describe("plugins sidecar module", () => {
  it("lists plugins per home, tagging each section with its home", async () => {
    seedPlugins(cairnDir, [{ name: "claude-code-proxy", url: "https://github.com/intisy-ai/claude-code-proxy", enabled: true }]);
    seedPlugins(claudeDir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);

    const { pluginsList } = await import("./plugins.js");
    const result = await pluginsList({ homes: fakeHomes });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const sections = result.data;
    expect(sections.map((s) => s.home.id)).toEqual(["cairn", "claude", "opencode"]);
    expect(sections[0].rows.map((r) => r.name)).toContain("claude-code-proxy");
    expect(sections[1].rows.map((r) => r.name)).toContain("plugin-a");
    expect(sections[2].rows).toEqual([]);
  });

  it("skips a home entirely when it is not present, without reading its dir", async () => {
    const homesWithAbsentOpencode: PluginHome[] = [
      fakeHomes[0],
      fakeHomes[1],
      { id: "opencode", label: "OpenCode", dir: join(opencodeDir, "does-not-exist"), present: false, hasUpdater: false },
    ];
    const { pluginsList } = await import("./plugins.js");
    const result = await pluginsList({ homes: homesWithAbsentOpencode });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data[2]).toEqual({ home: homesWithAbsentOpencode[2], rows: [] });
  });

  it("merges git + npm plugins with the update-state cache for a given home", async () => {
    seedPlugins(claudeDir, [
      { name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true },
      { name: "plugin-b", url: "https://github.com/intisy-ai/plugin-b", enabled: false },
    ]);
    seedNpmPlugins(claudeDir, ["npm-plugin-x"]);
    seedCache(claudeDir, {
      checkedAt: "2026-07-21T00:00:00.000Z",
      plugins: {
        "plugin-a": {
          kind: "git", installedVersion: null, localHead: "abc111", remoteHead: "def222",
          latestVersion: null, updateAvailable: true, updatedAt: null,
        },
        "npm-plugin-x": {
          kind: "npm", installedVersion: "1.2.3", localHead: null, remoteHead: null,
          latestVersion: "1.3.0", updateAvailable: true, updatedAt: null,
        },
      },
    });

    const { pluginsList } = await import("./plugins.js");
    const result = await pluginsList({ homes: fakeHomes });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const claudeSection = result.data.find((s) => s.home.id === "claude")!;
    const byName = new Map(claudeSection.rows.map((row) => [row.name, row]));
    expect(byName.get("plugin-a")).toEqual({
      name: "plugin-a", kind: "git", enabled: true, url: "https://github.com/intisy-ai/plugin-a",
      installedVersion: null, updateAvailable: true, description: "",
    });
    expect(byName.get("plugin-b")).toEqual({
      name: "plugin-b", kind: "git", enabled: false, url: "https://github.com/intisy-ai/plugin-b",
      installedVersion: null, updateAvailable: false, description: "",
    });
    expect(byName.get("npm-plugin-x")).toEqual({
      name: "npm-plugin-x", kind: "npm", enabled: true, url: undefined,
      installedVersion: "1.2.3", updateAvailable: true, description: "",
    });
  });

  it("install targets the requested home's dir via the write scope", async () => {
    const scopes: string[] = [];
    const fakeUpdate = async () => {
      scopes.push(getAppConfigDir(getAppName()));
    };

    const { pluginsInstall } = await import("./plugins.js");
    const result = await pluginsInstall("claude", "plugin-b", "https://github.com/intisy-ai/plugin-b", {
      updatePluginPublic: fakeUpdate,
      homes: fakeHomes,
      syncPluginsAcrossApps: async () => {},
      hasUpdater: () => true,
    });

    expect(result.ok).toBe(true);
    expect(scopes[0]).toBe(fakeHomes[1].dir);
  });

  it("install syncs across apps for an app home, but never for the cairn home", async () => {
    const syncPluginsAcrossApps = vi.fn().mockResolvedValue(undefined);
    const { pluginsInstall } = await import("./plugins.js");

    await pluginsInstall("claude", "plugin-b", "https://github.com/intisy-ai/plugin-b", {
      updatePluginPublic: async () => {},
      homes: fakeHomes,
      syncPluginsAcrossApps,
      hasUpdater: () => true,
    });
    expect(syncPluginsAcrossApps).toHaveBeenCalledWith(claudeDir);

    syncPluginsAcrossApps.mockClear();
    await pluginsInstall("cairn", "plugin-c", "https://github.com/intisy-ai/plugin-c", {
      updatePluginPublic: async () => {},
      homes: fakeHomes,
      syncPluginsAcrossApps,
      hasUpdater: () => true,
    });
    expect(syncPluginsAcrossApps).not.toHaveBeenCalled();
  });

  it("setEnabled writes the target home's plugins.json, not another home's", async () => {
    seedPlugins(cairnDir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);
    seedPlugins(claudeDir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);

    const { pluginsSetEnabled } = await import("./plugins.js");
    const result = await pluginsSetEnabled("claude", "plugin-a", false, { homes: fakeHomes });
    expect(result.ok).toBe(true);

    const claudeOnDisk = JSON.parse(readFileSync(join(claudeDir, "config", "plugins.json"), "utf8")) as Plugin[];
    expect(claudeOnDisk.find((p) => p.name === "plugin-a")?.enabled).toBe(false);

    const cairnOnDisk = JSON.parse(readFileSync(join(cairnDir, "config", "plugins.json"), "utf8")) as Plugin[];
    expect(cairnOnDisk.find((p) => p.name === "plugin-a")?.enabled).toBe(true);
  });

  it("setEnabled returns ok:false for an unknown plugin", async () => {
    seedPlugins(claudeDir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);
    const { pluginsSetEnabled } = await import("./plugins.js");
    const result = await pluginsSetEnabled("claude", "nonexistent", true, { homes: fakeHomes });
    expect(result.ok).toBe(false);
  });

  it("downgrade looks up the plugin in the requested home and calls the injected downgrade fn, no network", async () => {
    seedPlugins(claudeDir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", branch: "main", enabled: true }]);
    const downgrade = vi.fn().mockReturnValue("");

    const { pluginsDowngrade } = await import("./plugins.js");
    const result = await pluginsDowngrade("claude", "plugin-a", "deadbeef", { downgrade, homes: fakeHomes });

    expect(result.ok).toBe(true);
    expect(downgrade).toHaveBeenCalledWith(
      { name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", branch: "main" },
      "deadbeef",
    );
  });

  it("downgrade returns ok:false for an unknown plugin without calling downgrade", async () => {
    const downgrade = vi.fn().mockReturnValue("");
    const { pluginsDowngrade } = await import("./plugins.js");
    const result = await pluginsDowngrade("claude", "nonexistent", "deadbeef", { downgrade, homes: fakeHomes });
    expect(result.ok).toBe(false);
    expect(downgrade).not.toHaveBeenCalled();
  });

  it("downgrade returns ok:false when the injected downgrade fn reports an error", async () => {
    seedPlugins(claudeDir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);
    const downgrade = vi.fn().mockReturnValue("checkout failed");
    const { pluginsDowngrade } = await import("./plugins.js");
    const result = await pluginsDowngrade("claude", "plugin-a", "deadbeef", { downgrade, homes: fakeHomes });
    expect(result.ok).toBe(false);
  });

  it("install registers a new plugin in plugins.json when none exists yet", async () => {
    const { pluginsInstall } = await import("./plugins.js");
    const result = await pluginsInstall("claude", "plugin-new", "https://github.com/intisy-ai/plugin-new", {
      updatePluginPublic: async () => {},
      homes: fakeHomes,
      syncPluginsAcrossApps: async () => {},
      hasUpdater: () => true,
    });
    expect(result.ok).toBe(true);

    const entries = JSON.parse(readFileSync(join(claudeDir, "config", "plugins.json"), "utf8")) as Plugin[];
    expect(entries).toEqual([
      { name: "plugin-new", url: "https://github.com/intisy-ai/plugin-new", enabled: true, autoUpdate: true },
    ]);
  });

  it("install does not duplicate an existing entry and preserves its other fields", async () => {
    seedPlugins(claudeDir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: false, autoUpdate: false }]);

    const { pluginsInstall } = await import("./plugins.js");
    const result = await pluginsInstall("claude", "plugin-a", "https://github.com/intisy-ai/plugin-a-fork", {
      updatePluginPublic: async () => {},
      homes: fakeHomes,
      syncPluginsAcrossApps: async () => {},
    });
    expect(result.ok).toBe(true);

    const entries = JSON.parse(readFileSync(join(claudeDir, "config", "plugins.json"), "utf8")) as Plugin[];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a-fork", enabled: false, autoUpdate: false });
  });

  it("install leaves plugins.json unwritten when updatePluginPublic fails", async () => {
    const { pluginsInstall } = await import("./plugins.js");
    const result = await pluginsInstall("claude", "plugin-fail", "https://github.com/intisy-ai/plugin-fail", {
      updatePluginPublic: async () => { throw new Error("clone failed"); },
      homes: fakeHomes,
      syncPluginsAcrossApps: async () => {},
      hasUpdater: () => true,
    });
    expect(result.ok).toBe(false);
    expect(existsSync(join(claudeDir, "config", "plugins.json"))).toBe(false);
  });

  it("rejects an unknown home id on install, setEnabled, and downgrade", async () => {
    const { pluginsInstall, pluginsSetEnabled, pluginsDowngrade } = await import("./plugins.js");

    const installResult = await pluginsInstall("nope" as never, "x", "y", { homes: fakeHomes });
    expect(installResult.ok).toBe(false);

    const setEnabledResult = await pluginsSetEnabled("nope" as never, "x", true, { homes: fakeHomes });
    expect(setEnabledResult.ok).toBe(false);

    const downgradeResult = await pluginsDowngrade("nope" as never, "x", "deadbeef", { homes: fakeHomes });
    expect(downgradeResult.ok).toBe(false);
  });

  it("uninstalls a git row via uninstallPlugin under the target home's scope", async () => {
    const calls: Array<[string, string]> = [];
    seedPlugins(claudeDir, [{ name: "plugin-a", url: "u", enabled: true }]);
    const { pluginsUninstall } = await import("./plugins.js");
    const result = await pluginsUninstall("claude", "plugin-a", {
      homes: fakeHomes,
      uninstallPlugin: (dir, name) => calls.push([dir, name]),
    });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([[fakeHomes[1].dir, "plugin-a"]]);
  });

  it("routes an npm row to uninstallNpmPlugin and surfaces its error string", async () => {
    const { pluginsUninstall } = await import("./plugins.js");
    const result = await pluginsUninstall("opencode", "some-npm-plugin", {
      homes: fakeHomes,
      npmPlugins: async () => [{ name: "some-npm-plugin", version: "1.0.0", installed: true, raw: "some-npm-plugin" }],
      uninstallNpmPlugin: () => "npm exploded",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("npm exploded");
  });

  it("refuses to uninstall plugin-updater", async () => {
    const { pluginsUninstall } = await import("./plugins.js");
    const result = await pluginsUninstall("claude", "plugin-updater", { homes: fakeHomes });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("refusing to uninstall the plugin engine");
  });

  it("refuses to disable the mandatory engine", async () => {
    const homes = [{ id: "claude", label: "Claude", dir: "/c", present: true, hasUpdater: true }];
    const { pluginsSetEnabled } = await import("./plugins.js");
    const res = await pluginsSetEnabled("claude", "plugin-updater", false, { homes } as any);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/engine/i);
  });

  it("still allows disabling a normal plugin", async () => {
    expect(isMandatoryEngine("wakatime-sync")).toBe(false);
  });

  it("refuses to remove the mandatory engine everywhere", async () => {
    const { pluginsRemoveEverywhere } = await import("./plugins.js");
    const res = await pluginsRemoveEverywhere("plugin-updater", { homes: [] } as any);
    expect(res.ok).toBe(false);
  });

  it("rejects an unknown home id on uninstall", async () => {
    const { pluginsUninstall } = await import("./plugins.js");
    const result = await pluginsUninstall("nope", "plugin-a", { homes: fakeHomes });
    expect(result.ok).toBe(false);
  });

  it("auto-inits an app home missing the updater before installing", async () => {
    const order: string[] = [];
    const { pluginsInstall } = await import("./plugins.js");
    const result = await pluginsInstall("claude", "plugin-a", "https://github.com/intisy-ai/plugin-a", {
      homes: fakeHomes,
      hasUpdater: () => false,
      initApp: async (app) => { order.push("init:" + app); return { ok: true, data: { stdout: "", stderr: "" } }; },
      updatePluginPublic: async () => { order.push("install"); },
      syncPluginsAcrossApps: async () => {},
    });
    expect(result.ok).toBe(true);
    expect(order).toEqual(["init:claude", "install"]);
  });

  it("does not init the cairn home or an app home that already has the updater", async () => {
    const inits: string[] = [];
    const { pluginsInstall } = await import("./plugins.js");
    const deps = {
      homes: fakeHomes,
      initApp: async (a: string) => { inits.push(a); return { ok: true, data: { stdout: "", stderr: "" } }; },
      updatePluginPublic: async () => {},
      syncPluginsAcrossApps: async () => {},
    };

    await pluginsInstall("cairn", "x", "u", { ...deps, hasUpdater: () => false });
    await pluginsInstall("claude", "x", "u", { ...deps, hasUpdater: () => true });

    expect(inits).toEqual([]);
  });

  it("new installs honor the autoUpdateDefault setting", async () => {
    const { pluginsInstall } = await import("./plugins.js");

    mkdirSync(join(cairnDir, "config"), { recursive: true });
    writeFileSync(join(cairnDir, "config", "cairn.json"), JSON.stringify({ autoUpdateDefault: false }, null, 2), "utf8");
    process.env.HUB_CONFIG_DIR = cairnDir;

    const result = await pluginsInstall("claude", "plugin-new", "https://github.com/intisy-ai/plugin-new", {
      updatePluginPublic: async () => {},
      homes: fakeHomes,
      syncPluginsAcrossApps: async () => {},
      hasUpdater: () => true,
    });
    expect(result.ok).toBe(true);

    const entries = JSON.parse(readFileSync(join(claudeDir, "config", "plugins.json"), "utf8")) as Plugin[];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      name: "plugin-new",
      url: "https://github.com/intisy-ai/plugin-new",
      enabled: true,
      autoUpdate: false,
    });
  });

  it("pluginsInstallMany installs to each home and reports per-home outcomes", async () => {
    const deps = {
      homes: fakeHomes,
      hasUpdater: () => true,
      updatePluginPublic: async () => {},
      syncPluginsAcrossApps: async () => {},
    };
    const { pluginsInstallMany } = await import("./plugins.js");
    const res = await pluginsInstallMany("wakatime-sync", "https://github.com/intisy-ai/wakatime-sync", ["claude", "opencode"], deps);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.outcomes.map((o) => [o.home, o.ok])).toEqual([["claude", true], ["opencode", true]]);
  });

  it("pluginsInstallMany reports a per-home failure without aborting the rest", async () => {
    let first = true;
    const deps = {
      homes: fakeHomes,
      hasUpdater: () => true,
      updatePluginPublic: async () => {
        if (first) {
          first = false;
          throw new Error("bad");
        }
      },
      syncPluginsAcrossApps: async () => {},
    };
    const { pluginsInstallMany } = await import("./plugins.js");
    const res = await pluginsInstallMany("p", "u", ["claude", "opencode"], deps);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.outcomes[0]).toMatchObject({ home: "claude", ok: false });
      expect(res.data.outcomes[1]).toMatchObject({ home: "opencode", ok: true });
    }
  });

  it("pluginsRemoveEverywhere uninstalls only from homes where the plugin is installed", async () => {
    seedPlugins(claudeDir, [{ name: "shared-plugin", url: "u", enabled: true }]);
    const calls: Array<[string, string]> = [];
    const { pluginsRemoveEverywhere } = await import("./plugins.js");
    const res = await pluginsRemoveEverywhere("shared-plugin", {
      homes: fakeHomes,
      uninstallPlugin: (dir, name) => calls.push([dir, name]),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.outcomes.map((o) => o.home)).toEqual(["claude"]);
    expect(calls).toEqual([[claudeDir, "shared-plugin"]]);
  });

  it("pluginsList surfaces a description from the deployed clone package.json", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cairn-plugins-"));
    const repo = join(dir, "repos", "demo");
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", description: "A demo plugin" }));
    const homes = [{ id: "claude", label: "Claude", dir, present: true, hasUpdater: true }];
    const { pluginsList } = await import("./plugins.js");
    const res = await pluginsList({ homes, getPlugins: () => [{ name: "demo", url: "u", enabled: true }] } as any);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const row = res.data[0].rows.find((r) => r.name === "demo");
      expect(row?.description).toBe("A demo plugin");
    }
  });
});
