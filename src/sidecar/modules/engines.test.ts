import { describe, it, expect, vi } from "vitest";
import { enginesList, ensureEngines, ensureEngine } from "./engines.js";

const homes = [
  { id: "cairn", label: "Cairn", dir: "/cairn", present: true, hasUpdater: true },
  { id: "claude", label: "Claude", dir: "/c", present: true, hasUpdater: false },
  { id: "opencode", label: "OpenCode", dir: "/o", present: false, hasUpdater: false },
];

describe("enginesList", () => {
  it("reports per-home installed/enabled state for each engine and target", async () => {
    const res = await enginesList({ homes, getPlugins: (dir) => (dir === "/cairn" ? [{ name: "custom-auth", url: "u", enabled: true }] : []) } as any);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byId = Object.fromEntries(res.data.map((e) => [e.id, e]));
    // plugin-updater targets host apps only (not cairn); presence = hasUpdater
    expect(Object.keys(byId["plugin-updater"].homes).sort()).toEqual(["claude", "opencode"]);
    expect(byId["plugin-updater"].homes.claude.installed).toBe(false);
    // custom-auth targets cairn; installed because getPlugins on /cairn lists it
    expect(Object.keys(byId["custom-auth"].homes)).toEqual(["cairn"]);
    expect(byId["custom-auth"].homes.cairn.installed).toBe(true);
    expect(byId["plugin-updater"].mandatory).toBe(true);
    expect(byId["custom-auth"].mandatory).toBe(false);
  });
});

describe("ensureEngines", () => {
  it("initializes plugin-updater in present host homes lacking it, skips absent and already-present homes", async () => {
    const appsInit = vi.fn(async () => ({ ok: true, data: { stdout: "", stderr: "" } }));
    const pluginsInstall = vi.fn(async () => ({ ok: true, data: undefined }));
    const res = await ensureEngines({ homes, getPlugins: () => [], appsInit, pluginsInstall } as any);
    expect(res.ok).toBe(true);
    // claude is present + no updater -> init; opencode absent -> skip; cairn not a plugin-updater target
    expect(appsInit).toHaveBeenCalledTimes(1);
    expect(appsInit).toHaveBeenCalledWith("claude");
    // startup set is plugin-updater only; on-demand engines are not installed here
    expect(pluginsInstall).not.toHaveBeenCalled();
  });

  it("does nothing when every present host home already has the updater", async () => {
    const appsInit = vi.fn(async () => ({ ok: true, data: { stdout: "", stderr: "" } }));
    const allReady = homes.map((h) => (h.id === "claude" ? { ...h, hasUpdater: true } : h));
    const res = await ensureEngines({ homes: allReady, getPlugins: () => [], appsInit } as any);
    expect(res.ok).toBe(true);
    expect(appsInit).not.toHaveBeenCalled();
  });
});

describe("ensureEngine", () => {
  it("installs the capability's engine to its target home when absent", async () => {
    const pluginsInstall = vi.fn(async () => ({ ok: true, data: undefined }));
    const res = await ensureEngine("custom-endpoints", { homes, getPlugins: () => [], pluginsInstall } as any);
    expect(res.ok).toBe(true);
    expect(pluginsInstall).toHaveBeenCalledWith("cairn", "custom-auth", expect.stringContaining("custom-auth"));
  });

  it("is a no-op when the engine is already installed", async () => {
    const pluginsInstall = vi.fn(async () => ({ ok: true, data: undefined }));
    const res = await ensureEngine("custom-endpoints", { homes, getPlugins: (dir) => (dir === "/cairn" ? [{ name: "custom-auth", url: "u", enabled: true }] : []), pluginsInstall } as any);
    expect(res.ok).toBe(true);
    expect(pluginsInstall).not.toHaveBeenCalled();
  });

  it("errors on an unknown capability", async () => {
    const res = await ensureEngine("nope", { homes, getPlugins: () => [] } as any);
    expect(res.ok).toBe(false);
  });
});
