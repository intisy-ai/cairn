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

    const probe = vi.fn(async (bundlePath: string): Promise<PluginConfigSchema | null> => {
      expect(bundlePath.replaceAll("\\", "/")).toContain("/plugin/plugin-a.js");
      return { plugin: "plugin-a", defaults: { logging: true }, current: {} };
    });

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [home], probe });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual([{ plugin: "plugin-a", defaults: { logging: true }, current: {} }]);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("omits a plugin when the probe returns null", async () => {
    const { dir, home } = makeHome("claude", "Claude Code");
    writeFileSync(join(dir, "plugin", "plugin-a.js"), "// bundle placeholder", "utf8");
    seedPlugins(dir, [{ name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true }]);

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [home], probe: async () => null });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual([]);
  });

  it("returns ok:false for an unknown home id", async () => {
    const { home } = makeHome("claude", "Claude Code");
    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("nope", { homes: [home], probe: async () => null });
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

    const probe = async (): Promise<PluginConfigSchema> => ({
      plugin: "plugin-a", defaults: { x: 1 }, current: {},
      fields: [{ key: "x", type: "number" }], actions: [{ id: "go", label: "Go" }],
    });

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [home], probe });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data[0].fields).toEqual([{ key: "x", type: "number" }]);
    expect(result.data[0].actions).toEqual([{ id: "go", label: "Go" }]);
  });
});
