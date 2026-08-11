import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "@plugin-updater/types.js";
import type { PluginHome, PluginConfigSchema } from "../../../packages/shared/src/domain.js";

function makeHome(id: "cairn" | "claude" | "opencode", label: string): { dir: string; home: PluginHome } {
  const dir = mkdtempSync(join(tmpdir(), `dash-appconfig-${id}-`));
  mkdirSync(join(dir, "config"), { recursive: true });
  mkdirSync(join(dir, "plugin"), { recursive: true });
  return { dir, home: { id, label, dir, present: true, hasUpdater: true } };
}

function seedPlugins(dir: string, entries: Plugin[]): void {
  writeFileSync(join(dir, "config", "plugins.json"), JSON.stringify(entries, null, 2), "utf8");
}

describe("appConfig sidecar module", () => {
  it("returns schemas only for plugins with a deployed bundle, skipping missing ones without probing", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    writeFileSync(join(dir, "plugin", "plugin-a.js"), "// bundle placeholder", "utf8");
    seedPlugins(dir, [
      { name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true },
      { name: "plugin-b", url: "https://github.com/intisy-ai/plugin-b", enabled: true },
    ]);

    // Only the plugin with a deployed bundle is offered for declaration resolution at all,
    // so a plugin with nothing to run is skipped without paying for a probe.
    const declarations = vi.fn(async (bundles: { plugin: string; path: string }[]) => {
      expect(bundles.map((b) => b.plugin)).toEqual(["plugin-a"]);
      expect(bundles[0].path.replaceAll("\\", "/")).toContain("/plugin/plugin-a.js");
      return new Map([["plugin-a", { defaults: { logging: true } }]]);
    });

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [home], declarations, engineSchemas: async () => [] });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual([
      { plugin: "plugin-a", defaults: { logging: true }, current: {}, layout: { sections: [], fields: [], actions: [] } },
    ]);
    expect(declarations).toHaveBeenCalledTimes(1);
  });

  it("resolves each declaration into its contributed sections and what no section claimed", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    writeFileSync(join(dir, "plugin", "sync-bridge.js"), "// bundle placeholder", "utf8");
    seedPlugins(dir, [{ name: "sync-bridge", url: "https://github.com/intisy-ai/sync-bridge", enabled: true }]);

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", {
      homes: [home],
      engineSchemas: async () => [],
      declarations: async () =>
        new Map([[
          "sync-bridge",
          {
            defaults: { enabled: true, logging: true },
            fields: [
              { key: "enabled", type: "boolean" as const },
              { key: "logging", type: "boolean" as const },
            ],
            actions: [{ id: "sync", label: "Sync now" }],
            sections: [{ id: "sync", label: "Sync", fields: ["enabled"], actions: ["sync"] }],
          },
        ]]),
    });

    if (!result.ok) throw new Error("unreachable");
    const { layout } = result.data[0];
    expect(layout?.sections.map((s) => ({ id: s.id, plugin: s.plugin, keys: s.fields.map((f) => f.key), actions: s.actions.map((a) => a.id) }))).toEqual([
      { id: "sync", plugin: "sync-bridge", keys: ["enabled"], actions: ["sync"] },
    ]);
    expect(layout?.fields.map((f) => f.key)).toEqual(["logging"]);
    expect(layout?.actions).toEqual([]);
  });

  it("omits a plugin when the probe returns null", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    writeFileSync(join(dir, "plugin", "plugin-a.js"), "// bundle placeholder", "utf8");
    seedPlugins(dir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [home], declarations: async () => new Map(), engineSchemas: async () => [] });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual([]);
  });

  it("returns ok:false for an unknown home id", async () => {
    const { home } = makeHome("claude", "Claude Code");
    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("nope", { homes: [home], declarations: async () => new Map() });
    expect(result.ok).toBe(false);
  });

  it("configWrite creates config/<plugin>.json when it does not exist yet", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    seedPlugins(dir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);

    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("claude", "plugin-a", "logging", false, { homes: [home] });

    expect(result.ok).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(dir, "config", "plugin-a.json"), "utf8"));
    expect(onDisk).toEqual({ logging: false });
  });

  it("configWrite records the change, with the before and after values and the affected home", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    seedPlugins(dir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);
    writeFileSync(join(dir, "config", "plugin-a.json"), JSON.stringify({ logging: true }), "utf8");
    const cairnHome = mkdtempSync(join(tmpdir(), "dash-appconfig-own-"));
    vi.stubEnv("HUB_CONFIG_DIR", cairnHome);
    try {
      const { configWrite } = await import("./appConfig.js");
      const result = await configWrite("claude", "plugin-a", "logging", false, { homes: [home] });
      expect(result.ok).toBe(true);

      const { readActivity } = await import("@core/index.js");
      const { records } = readActivity([cairnHome], { topics: ["config.changed"] });
      const rec = records.find((r) => r.details.key === "logging");
      expect(rec).toBeDefined();
      expect(rec!.changes).toEqual([{ key: "logging", from: true, to: false }]);
      expect(rec!.target).toEqual({ home: dir });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("configWrite merges into an existing file, preserving unrelated keys", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    seedPlugins(dir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);
    writeFileSync(join(dir, "config", "plugin-a.json"), JSON.stringify({ logging: true, otherKey: "keep-me" }, null, 2), "utf8");

    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("claude", "plugin-a", "logging", false, { homes: [home] });

    expect(result.ok).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(dir, "config", "plugin-a.json"), "utf8"));
    expect(onDisk).toEqual({ logging: false, otherKey: "keep-me" });
  });

  it("configWrite returns ok:false for an unknown home id and writes nothing", async () => {
    const { dir } = makeHome("claude", "Claude Code");
    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("nope", "plugin-a", "logging", false, { homes: [] });
    expect(result.ok).toBe(false);
    expect(existsSync(join(dir, "config", "plugin-a.json"))).toBe(false);
  });

  it("configWrite rejects path traversal attempts and does not create files outside the home", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    seedPlugins(dir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);

    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("claude", "../escape", "logging", false, { homes: [home] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("plugin not found");
    expect(existsSync(join(dir, "..", "escape.json"))).toBe(false);
  });

  it("configWrite's containment check rejects a plugins.json entry whose name escapes the config dir", async () => {
    // getPlugins never validates the name field, so this seeds the one case that
    // reaches the containment assertion (the plugin-list guard alone would let it through).
    const { dir, home } = makeHome("claude", "Claude Code");
    seedPlugins(dir, [{ name: "../escape", url: "https://github.com/intisy-ai/escape", enabled: true }]);

    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("claude", "../escape", "logging", false, { homes: [home] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("invalid config target");
    expect(existsSync(join(dir, "escape.json"))).toBe(false);
  });

  it("configWrite rejects prototype pollution keys", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    seedPlugins(dir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);

    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("claude", "plugin-a", "__proto__", { malicious: true }, { homes: [home] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("invalid config key");
  });

  it("configAction runs a declared action and returns its output", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    writeFileSync(join(dir, "plugin", "plugin-a.js"), "// bundle", "utf8");
    seedPlugins(dir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);

    const probe = async (): Promise<PluginConfigSchema> => ({ plugin: "plugin-a", defaults: {}, current: {}, actions: [{ id: "ping", label: "Ping" }] });
    const run = vi.fn(async () => ({ stdout: "pong", stderr: "" }));

    const { configAction } = await import("./appConfig.js");
    const result = await configAction("claude", "plugin-a", "ping", { homes: [home], probe, run });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual({ stdout: "pong", stderr: "" });
    expect(run).toHaveBeenCalledOnce();
  });

  it("configAction rejects an action id the plugin never declared, without running it", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    writeFileSync(join(dir, "plugin", "plugin-a.js"), "// bundle", "utf8");
    seedPlugins(dir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);

    const probe = async (): Promise<PluginConfigSchema> => ({ plugin: "plugin-a", defaults: {}, current: {}, actions: [{ id: "ping", label: "Ping" }] });
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));

    const { configAction } = await import("./appConfig.js");
    const result = await configAction("claude", "plugin-a", "danger", { homes: [home], probe, run });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("unknown action");
    expect(run).not.toHaveBeenCalled();
  });

  it("configAction returns an error for a plugin not installed in the home", async () => {
    const { home } = makeHome("claude", "Claude Code");
    const { configAction } = await import("./appConfig.js");
    const result = await configAction("claude", "ghost", "ping", { homes: [home], probe: async () => null, run: async () => ({ stdout: "", stderr: "" }) });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("plugin not found");
  });

  it("realProbe path carries declared fields and actions through when present", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    writeFileSync(join(dir, "plugin", "plugin-a.js"), "// bundle", "utf8");
    seedPlugins(dir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);

    const declarations = async () => new Map([["plugin-a", {
      defaults: { x: 1 }, fields: [{ key: "x", type: "number" as const }], actions: [{ id: "go", label: "Go" }],
    }]]);

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [home], declarations, engineSchemas: async () => [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data[0].fields).toEqual([{ key: "x", type: "number" }]);
    expect(result.data[0].actions).toEqual([{ id: "go", label: "Go" }]);
  });
});

// An engine can be installed in a home without a bundle to probe there: an npm-registered
// updater, or a home with nothing deployed yet. Its settings have to be reachable anyway,
// which is what makes the update controls configurable per app.
describe("engine-contributed settings", () => {
  it("lists the updater's own settings for a home with no deployed bundle", async () => {
    const { home } = makeHome("cairn", "Cairn");

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("cairn", { homes: [home], declarations: async () => new Map() });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const updater = result.data.find((s) => s.plugin === "plugin-updater");
    expect(updater).toBeDefined();
    expect(updater!.defaults.auto_update_mode).toBe("update");
    expect(updater!.fields?.some((f) => f.key === "auto_update_mode")).toBe(true);
  });

  it("reads the values that home has on disk, not another home's", async () => {
    const { dir, home } = makeHome("cairn", "Cairn");
    writeFileSync(join(dir, "config", "plugin-updater.json"), JSON.stringify({ auto_update_mode: "check" }), "utf8");

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("cairn", { homes: [home], declarations: async () => new Map() });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.find((s) => s.plugin === "plugin-updater")!.current.auto_update_mode).toBe("check");
  });

  it("prefers the deployed bundle's answer, which is the copy that home runs", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    writeFileSync(join(dir, "plugin", "plugin-updater.js"), "// bundle", "utf8");
    seedPlugins(dir, [{ name: "plugin-updater", url: "https://github.com/intisy-ai/plugin-updater", enabled: true }]);

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", {
      homes: [home],
      declarations: async () => new Map([["plugin-updater", { defaults: { probed: true } }]]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const found = result.data.filter((s) => s.plugin === "plugin-updater");
    expect(found).toHaveLength(1);
    expect(found[0].defaults).toEqual({ probed: true });
  });

  it("contributes nothing to a home that does not have the engine", async () => {
    const { home } = makeHome("claude", "Claude Code");

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [{ ...home, hasUpdater: false }], declarations: async () => new Map() });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual([]);
  });

  it("writes an engine's setting even though it is not a plugins.json entry", async () => {
    const { dir, home } = makeHome("cairn", "Cairn");

    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("cairn", "plugin-updater", "auto_update_mode", "check", { homes: [home] });

    expect(result.ok).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(dir, "config", "plugin-updater.json"), "utf8"));
    expect(onDisk.auto_update_mode).toBe("check");
  });

  // The triggers are declared as dot-path fields, so a generic control edits one of them
  // without rewriting its siblings.
  it("writes one nested trigger and reads the whole object back", async () => {
    const { dir, home } = makeHome("cairn", "Cairn");
    writeFileSync(join(dir, "config", "plugin-updater.json"), JSON.stringify({ auto_update_triggers: { loader: true, app: true, cairn: true } }), "utf8");

    const { configWrite, configSchemas } = await import("./appConfig.js");
    expect((await configWrite("cairn", "plugin-updater", "auto_update_triggers.app", false, { homes: [home] })).ok).toBe(true);

    const result = await configSchemas("cairn", { homes: [home], declarations: async () => new Map() });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.find((s) => s.plugin === "plugin-updater")!.current.auto_update_triggers).toEqual({
      loader: true, app: false, cairn: true,
    });
  });

  it("still refuses a plugin that is neither installed nor an engine", async () => {
    const { home } = makeHome("cairn", "Cairn");

    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("cairn", "not-a-thing", "k", 1, { homes: [home] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("plugin not found: not-a-thing");
  });
});
