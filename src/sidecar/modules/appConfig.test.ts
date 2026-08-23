import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "@intisy-ai/plugin-updater/dist/types.js";
import type { PluginHome } from "../../../packages/shared/src/domain.js";

function makeHome(id: "cairn" | "claude" | "opencode", label: string): { dir: string; home: PluginHome } {
  const dir = mkdtempSync(join(tmpdir(), `dash-appconfig-${id}-`));
  mkdirSync(join(dir, "config"), { recursive: true });
  mkdirSync(join(dir, "plugin"), { recursive: true });
  return { dir, home: { id, label, dir, present: true, hasUpdater: true } };
}

function seedPlugins(dir: string, entries: Plugin[]): void {
  writeFileSync(join(dir, "config", "plugins.json"), JSON.stringify(entries, null, 2), "utf8");
}

// The module asks the home's manager for its plugins rather than reading plugins.json itself, so
// these stand in for that answer. They read the same seed the fixtures already write, which keeps
// every case stating its plugins in one place.
function listedFromSeed(dir: string) {
  return async () => {
    try {
      return (JSON.parse(readFileSync(join(dir, "config", "plugins.json"), "utf8")) as Plugin[])
        .map((entry) => ({ id: entry.name }));
    } catch {
      return [];
    }
  };
}

function bundlesFromSeed(dir: string) {
  return async () => (await listedFromSeed(dir)())
    .map((entry) => ({ plugin: entry.id, path: join(dir, "plugin", `${entry.id}.js`) }))
    .filter((bundle) => existsSync(bundle.path));
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
    const result = await configSchemas("claude", { homes: [home], bundles: bundlesFromSeed(home.dir), declarations, engineSchemas: async () => [], settingsProviders: async () => [] });

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
    const result = await configSchemas("claude", { homes: [home], bundles: bundlesFromSeed(home.dir),
      engineSchemas: async () => [],
      settingsProviders: async () => [],
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
    const result = await configSchemas("claude", { homes: [home], bundles: bundlesFromSeed(home.dir), declarations: async () => new Map(), engineSchemas: async () => [], settingsProviders: async () => [] });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual([]);
  });

  it("returns ok:false for an unknown home id", async () => {
    const { home } = makeHome("claude", "Claude Code");
    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("nope", { homes: [home], declarations: async () => new Map(), settingsProviders: async () => [] });
    expect(result.ok).toBe(false);
  });

  it("prefers a plugin's settings capability for its declaration, but the probe for its defaults", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    writeFileSync(join(dir, "plugin", "historian.js"), "// bundle placeholder", "utf8");
    seedPlugins(dir, [{ name: "historian", url: "https://github.com/intisy-ai/historian", enabled: true }]);
    writeFileSync(join(dir, "config", "historian.json"), JSON.stringify({ verbose: false }), "utf8");

    // The capability answers with the LIVE declaration; the probe answers with what defineConfig
    // registered in the bundle's own module instance. Each value differs from its counterpart on
    // the other side, so a fixture that silently swapped the two sources would fail this.
    const schema = vi.fn(async () => ({
      fields: [{ key: "verbose", type: "boolean" as const, label: "Verbose" }],
      actions: [{ id: "sync", label: "Sync now" }],
    }));
    const settingsProviders = vi.fn(async (homeDir: string, appId: string) => {
      expect(homeDir).toBe(dir);
      expect(appId).toBe("claude");
      return [{ pluginId: "historian", implementation: { schema, run: vi.fn() } }];
    });

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [home], bundles: bundlesFromSeed(home.dir),
      engineSchemas: async () => [],
      declarations: async () => new Map([["historian", { defaults: { verbose: true } }]]),
      settingsProviders,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].plugin).toBe("historian");
    expect(result.data[0].defaults).toEqual({ verbose: true });
    expect(result.data[0].current).toEqual({ verbose: false });
    expect(result.data[0].fields).toEqual([{ key: "verbose", type: "boolean", label: "Verbose" }]);
    expect(result.data[0].actions).toEqual([{ id: "sync", label: "Sync now" }]);
    expect(schema).toHaveBeenCalledTimes(1);
  });

  it("falls back to the probe entirely for a plugin with no settings capability", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    writeFileSync(join(dir, "plugin", "legacy.js"), "// bundle placeholder", "utf8");
    seedPlugins(dir, [{ name: "legacy", url: "https://github.com/intisy-ai/legacy", enabled: true }]);

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [home], bundles: bundlesFromSeed(home.dir),
      engineSchemas: async () => [],
      settingsProviders: async () => [],
      declarations: async () => new Map([["legacy", { defaults: { b: 2 }, fields: [{ key: "b", type: "number" as const }] }]]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.map((s) => s.plugin)).toEqual(["legacy"]);
    expect(result.data[0].defaults).toEqual({ b: 2 });
    expect(result.data[0].fields).toEqual([{ key: "b", type: "number" }]);
  });

  it("defaults to an empty object when the probe has no declaration for a capability-only plugin", async () => {
    const { home } = makeHome("claude", "Claude Code");

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [home], bundles: bundlesFromSeed(home.dir),
      engineSchemas: async () => [],
      declarations: async () => new Map(),
      settingsProviders: async () => [{ pluginId: "historian", implementation: { schema: async () => ({}), run: vi.fn() } }],
    });

    if (!result.ok) throw new Error("unreachable");
    expect(result.data[0].defaults).toEqual({});
  });

  // callHostCapability never throws, so a rejecting schema() surfaces as answer.ok === false;
  // that one plugin must degrade to an empty declaration rather than sinking every other
  // plugin's schemas for the home.
  it("degrades a plugin whose schema() rejects, without sinking the rest of the list", async () => {
    const { home } = makeHome("claude", "Claude Code");

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [home], bundles: bundlesFromSeed(home.dir),
      engineSchemas: async () => [],
      declarations: async () => new Map([["broken", { defaults: { x: 1 } }]]),
      settingsProviders: async () => [
        { pluginId: "broken", implementation: { schema: async () => { throw new Error("boom"); }, run: vi.fn() } },
        { pluginId: "fine", implementation: { schema: async () => ({ fields: [{ key: "y", type: "boolean" as const }] }), run: vi.fn() } },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.map((s) => s.plugin)).toEqual(["broken", "fine"]);
    expect(result.data[0].defaults).toEqual({ x: 1 });
    expect(result.data[0].fields).toBeUndefined();
    expect(result.data[1].fields).toEqual([{ key: "y", type: "boolean" }]);
  });

  it("configWrite creates config/<plugin>.json when it does not exist yet", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    seedPlugins(dir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);

    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("claude", "plugin-a", "logging", false, { homes: [home], listPlugins: listedFromSeed(home.dir) });

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
      const result = await configWrite("claude", "plugin-a", "logging", false, { homes: [home], listPlugins: listedFromSeed(home.dir) });
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
    const result = await configWrite("claude", "plugin-a", "logging", false, { homes: [home], listPlugins: listedFromSeed(home.dir) });

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
    const result = await configWrite("claude", "../escape", "logging", false, { homes: [home], listPlugins: listedFromSeed(home.dir), managed: async () => true });

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
    const result = await configWrite("claude", "../escape", "logging", false, { homes: [home], listPlugins: listedFromSeed(home.dir), managed: async () => true });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("invalid config target");
    expect(existsSync(join(dir, "escape.json"))).toBe(false);
  });

  it("configWrite rejects prototype pollution keys", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    seedPlugins(dir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);

    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("claude", "plugin-a", "__proto__", { malicious: true }, { homes: [home], listPlugins: listedFromSeed(home.dir) });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("invalid config key");
  });

  it("configAction runs a declared action through the settings capability and returns its output", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    const run = vi.fn(async (actionId: string) => {
      expect(actionId).toBe("snapshot");
      return { ok: true, message: "ran" };
    });
    // home.dir and home.id are two distinct strings, so a positional swap in the
    // settingsProviders(homeDir, appId) call cannot pass unnoticed.
    const settingsProviders = async (homeDir: string, appId: string) => {
      expect(homeDir).toBe(dir);
      expect(appId).toBe("claude");
      return [{
        pluginId: "historian",
        implementation: { schema: async () => ({ actions: [{ id: "snapshot", label: "Snapshot" }] }), run },
      }];
    };

    const { configAction } = await import("./appConfig.js");
    const result = await configAction("claude", "historian", "snapshot", { homes: [home], settingsProviders });

    expect(result).toEqual({ ok: true, data: { stdout: "ran", stderr: "" } });
    expect(run).toHaveBeenCalledWith("snapshot");
  });

  it("fails the whole action rather than reporting a refusal as data", async () => {
    const { home } = makeHome("claude", "Claude Code");
    const run = vi.fn(async () => ({ ok: false, message: "conflict with a concurrent sync" }));
    const settingsProviders = async () => [{
      pluginId: "historian",
      implementation: { schema: async () => ({ actions: [{ id: "snapshot", label: "Snapshot" }] }), run },
    }];

    const { configAction } = await import("./appConfig.js");
    const result = await configAction("claude", "historian", "snapshot", { homes: [home], settingsProviders });

    expect(result).toEqual({ ok: false, error: "conflict with a concurrent sync" });
  });

  // createSettingsCapability already converts a thrown error into {ok:false, message}, and
  // callHostCapability never throws either, so a provider that throws directly (an older
  // capability not built on createSettingsCapability, or a bug in callHostCapability's own
  // wrapping) must land on the exact same failed-Result path, not crash the sidecar handler.
  it("fails the action the same way when run throws instead of resolving ok:false", async () => {
    const { home } = makeHome("claude", "Claude Code");
    const run = vi.fn(async () => { throw new Error("disk full"); });
    const settingsProviders = async () => [{
      pluginId: "historian",
      implementation: { schema: async () => ({ actions: [{ id: "snapshot", label: "Snapshot" }] }), run },
    }];

    const { configAction } = await import("./appConfig.js");
    const result = await configAction("claude", "historian", "snapshot", { homes: [home], settingsProviders });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("disk full");
  });

  // If a failing schema() let an unvalidated action id through to run, the validation would be
  // decorative: `declared` must default closed (false), not open, when the capability that is
  // supposed to answer for it cannot be reached.
  it("refuses the action rather than running it unvalidated when schema() rejects", async () => {
    const { home } = makeHome("claude", "Claude Code");
    const run = vi.fn();
    const settingsProviders = async () => [{
      pluginId: "historian",
      implementation: { schema: async () => { throw new Error("capability wedged"); }, run },
    }];

    const { configAction } = await import("./appConfig.js");
    const result = await configAction("claude", "historian", "snapshot", { homes: [home], settingsProviders });

    expect(result).toEqual({ ok: false, error: "unknown action: snapshot" });
    expect(run).not.toHaveBeenCalled();
  });

  it("configAction rejects an action id the plugin never declared, without running it", async () => {
    const { home } = makeHome("claude", "Claude Code");
    const run = vi.fn();
    const settingsProviders = async () => [{
      pluginId: "historian",
      implementation: { schema: async () => ({ actions: [{ id: "snapshot", label: "Snapshot" }] }), run },
    }];

    const { configAction } = await import("./appConfig.js");
    const result = await configAction("claude", "historian", "danger", { homes: [home], settingsProviders });

    expect(result).toEqual({ ok: false, error: "unknown action: danger" });
    expect(run).not.toHaveBeenCalled();
  });

  it("configAction returns an error for a plugin with no settings capability in the home", async () => {
    const { home } = makeHome("claude", "Claude Code");
    const { configAction } = await import("./appConfig.js");
    const result = await configAction("claude", "ghost", "ping", { homes: [home], settingsProviders: async () => [] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("plugin not found");
  });

  it("the probe still carries a plugin's fields and actions through when it has no settings capability", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    writeFileSync(join(dir, "plugin", "plugin-a.js"), "// bundle", "utf8");
    seedPlugins(dir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);

    const declarations = async () => new Map([["plugin-a", {
      defaults: { x: 1 }, fields: [{ key: "x", type: "number" as const }], actions: [{ id: "go", label: "Go" }],
    }]]);

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [home], bundles: bundlesFromSeed(home.dir), declarations, engineSchemas: async () => [], settingsProviders: async () => [] });
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
    const result = await configSchemas("cairn", { homes: [home], bundles: bundlesFromSeed(home.dir), declarations: async () => new Map(), settingsProviders: async () => [] });

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
    const result = await configSchemas("cairn", { homes: [home], bundles: bundlesFromSeed(home.dir), declarations: async () => new Map(), settingsProviders: async () => [] });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.find((s) => s.plugin === "plugin-updater")!.current.auto_update_mode).toBe("check");
  });

  it("prefers the deployed bundle's answer, which is the copy that home runs", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    writeFileSync(join(dir, "plugin", "plugin-updater.js"), "// bundle", "utf8");
    seedPlugins(dir, [{ name: "plugin-updater", url: "https://github.com/intisy-ai/plugin-updater", enabled: true }]);

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [home], bundles: bundlesFromSeed(home.dir),
      declarations: async () => new Map([["plugin-updater", { defaults: { probed: true } }]]),
      settingsProviders: async () => [],
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
    const result = await configSchemas("claude", { homes: [{ ...home, hasUpdater: false }], declarations: async () => new Map(), settingsProviders: async () => [] });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual([]);
  });

  it("writes an engine's setting even though it is not a plugins.json entry", async () => {
    const { dir, home } = makeHome("cairn", "Cairn");
    writeFileSync(join(dir, "plugin", "plugin-updater.json"), JSON.stringify({ id: "plugin-updater", api: 1, entry: "dist/index.js", capabilities: ["plugin-management"] }));

    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("cairn", "plugin-updater", "auto_update_mode", "check", { homes: [home], listPlugins: listedFromSeed(home.dir) });

    expect(result.ok).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(dir, "config", "plugin-updater.json"), "utf8"));
    expect(onDisk.auto_update_mode).toBe("check");
  });

  // The triggers are declared as dot-path fields, so a generic control edits one of them
  // without rewriting its siblings.
  it("writes one nested trigger and reads the whole object back", async () => {
    const { dir, home } = makeHome("cairn", "Cairn");
    writeFileSync(join(dir, "plugin", "plugin-updater.json"), JSON.stringify({ id: "plugin-updater", api: 1, entry: "dist/index.js", capabilities: ["plugin-management"] }));
    writeFileSync(join(dir, "config", "plugin-updater.json"), JSON.stringify({ auto_update_triggers: { loader: true, app: true, cairn: true } }), "utf8");

    const { configWrite, configSchemas } = await import("./appConfig.js");
    expect((await configWrite("cairn", "plugin-updater", "auto_update_triggers.app", false, { homes: [home], listPlugins: listedFromSeed(home.dir) })).ok).toBe(true);

    const result = await configSchemas("cairn", { homes: [home], bundles: bundlesFromSeed(home.dir), declarations: async () => new Map(), settingsProviders: async () => [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.find((s) => s.plugin === "plugin-updater")!.current.auto_update_triggers).toEqual({
      loader: true, app: false, cairn: true,
    });
  });

  it("still refuses a plugin that is neither installed nor an engine", async () => {
    const { home } = makeHome("cairn", "Cairn");

    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("cairn", "not-a-thing", "k", 1, { homes: [home], listPlugins: listedFromSeed(home.dir), managed: async () => true });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("plugin not found: not-a-thing");
  });
});

describe("configWrite accepts a plugin the home deployed but never listed", () => {
  it("writes for a plugin present as a sidecar and absent from the plugin list", async () => {
    const home = mkdtempSync(join(tmpdir(), "cairn-cw-"));
    mkdirSync(join(home, "plugin"), { recursive: true });
    writeFileSync(join(home, "plugin", "engine.json"), JSON.stringify({ id: "engine", api: 1, entry: "dist/index.js", capabilities: [] }));
    writeFileSync(join(home, "plugin", "engine.js"), "export default {};");
    const homes = [{ id: "cairn", label: "Cairn", dir: home, present: true, hasUpdater: true }];
    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("cairn", "engine", "flag", true, { homes });
    expect(result.ok).toBe(true);
  });

  it("refuses a plugin that is neither listed nor deployed", async () => {
    const home = mkdtempSync(join(tmpdir(), "cairn-cw-"));
    const homes = [{ id: "cairn", label: "Cairn", dir: home, present: true, hasUpdater: true }];
    const { configWrite } = await import("./appConfig.js");
    const result = await configWrite("cairn", "ghost", "flag", true, { homes, managed: async () => true });
    expect(result).toEqual({ ok: false, error: "plugin not found: ghost" });
  });
});
