import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "@plugin-updater/types.js";
import type { UpdateCache } from "@plugin-updater/cache.js";

let configDir: string;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "dash-plugins-"));
  process.env.HUB_CONFIG_DIR = configDir;
  mkdirSync(join(configDir, "config"), { recursive: true });
});

function seedPlugins(entries: Plugin[]): void {
  writeFileSync(join(configDir, "config", "plugins.json"), JSON.stringify(entries, null, 2), "utf8");
}

function seedNpmPlugins(names: string[]): void {
  writeFileSync(join(configDir, "opencode.json"), JSON.stringify({ plugin: names }, null, 2), "utf8");
}

function seedCache(cache: UpdateCache): void {
  mkdirSync(join(configDir, "cache"), { recursive: true });
  writeFileSync(join(configDir, "cache", "plugin-updates.json"), JSON.stringify(cache, null, 2), "utf8");
}

describe("plugins sidecar module", () => {
  it("merges git + npm plugins with the update-state cache", async () => {
    seedPlugins([
      { name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true },
      { name: "plugin-b", url: "https://github.com/intisy-ai/plugin-b", enabled: false },
    ]);
    seedNpmPlugins(["npm-plugin-x"]);
    seedCache({
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
    const result = await pluginsList();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const byName = new Map(result.data.map((row) => [row.name, row]));
    expect(byName.get("plugin-a")).toEqual({
      name: "plugin-a", kind: "git", enabled: true, url: "https://github.com/intisy-ai/plugin-a",
      installedVersion: null, updateAvailable: true,
    });
    expect(byName.get("plugin-b")).toEqual({
      name: "plugin-b", kind: "git", enabled: false, url: "https://github.com/intisy-ai/plugin-b",
      installedVersion: null, updateAvailable: false,
    });
    expect(byName.get("npm-plugin-x")).toEqual({
      name: "npm-plugin-x", kind: "npm", enabled: true, url: undefined,
      installedVersion: "1.2.3", updateAvailable: true,
    });
  });

  it("returns an empty list on a bare store", async () => {
    const { pluginsList } = await import("./plugins.js");
    const result = await pluginsList();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual([]);
  });

  it("setEnabled flips one plugin's enabled flag and preserves the rest", async () => {
    seedPlugins([
      { name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true },
      { name: "plugin-b", url: "https://github.com/intisy-ai/plugin-b", enabled: true, autoUpdate: false },
    ]);

    const { pluginsSetEnabled } = await import("./plugins.js");
    const result = await pluginsSetEnabled("plugin-a", false);
    expect(result.ok).toBe(true);

    const onDisk = JSON.parse(readFileSync(join(configDir, "config", "plugins.json"), "utf8")) as Plugin[];
    expect(onDisk.find((p) => p.name === "plugin-a")?.enabled).toBe(false);
    expect(onDisk.find((p) => p.name === "plugin-b")).toEqual({
      name: "plugin-b", url: "https://github.com/intisy-ai/plugin-b", enabled: true, autoUpdate: false,
    });
  });

  it("setEnabled returns ok:false for an unknown plugin", async () => {
    seedPlugins([{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);
    const { pluginsSetEnabled } = await import("./plugins.js");
    const result = await pluginsSetEnabled("nonexistent", true);
    expect(result.ok).toBe(false);
  });

  it("install calls updatePluginPublic then syncPluginsAcrossApps via injected deps, no network", async () => {
    const updatePluginPublic = vi.fn().mockResolvedValue(undefined);
    const syncPluginsAcrossApps = vi.fn().mockResolvedValue(undefined);

    const { pluginsInstall } = await import("./plugins.js");
    const result = await pluginsInstall("new-plugin", "https://github.com/intisy-ai/new-plugin", {
      updatePluginPublic,
      syncPluginsAcrossApps,
    });

    expect(result.ok).toBe(true);
    expect(updatePluginPublic).toHaveBeenCalledWith("new-plugin", "https://github.com/intisy-ai/new-plugin");
    expect(syncPluginsAcrossApps).toHaveBeenCalledWith(configDir);
  });

  it("downgrade looks up the plugin and calls the injected downgrade fn, no network", async () => {
    seedPlugins([{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", branch: "main", enabled: true }]);
    const downgrade = vi.fn().mockReturnValue("");

    const { pluginsDowngrade } = await import("./plugins.js");
    const result = await pluginsDowngrade("plugin-a", "deadbeef", { downgrade });

    expect(result.ok).toBe(true);
    expect(downgrade).toHaveBeenCalledWith(
      { name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", branch: "main" },
      "deadbeef",
    );
  });

  it("downgrade returns ok:false for an unknown plugin without calling downgrade", async () => {
    const downgrade = vi.fn().mockReturnValue("");
    const { pluginsDowngrade } = await import("./plugins.js");
    const result = await pluginsDowngrade("nonexistent", "deadbeef", { downgrade });
    expect(result.ok).toBe(false);
    expect(downgrade).not.toHaveBeenCalled();
  });

  it("downgrade returns ok:false when the injected downgrade fn reports an error", async () => {
    seedPlugins([{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);
    const downgrade = vi.fn().mockReturnValue("checkout failed");
    const { pluginsDowngrade } = await import("./plugins.js");
    const result = await pluginsDowngrade("plugin-a", "deadbeef", { downgrade });
    expect(result.ok).toBe(false);
  });
});
