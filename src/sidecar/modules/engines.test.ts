import { describe, it, expect, vi } from "vitest";
import { enginesList, ensureEngine, ensureEngineIn } from "./engines.js";

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
    expect(Object.keys(byId["plugin-updater"].homes).sort()).toEqual(["cairn", "claude", "opencode"]);
    expect(byId["plugin-updater"].homes.claude.installed).toBe(false);
    // custom-auth targets cairn; installed because getPlugins on /cairn lists it
    expect(Object.keys(byId["custom-auth"].homes)).toEqual(["cairn"]);
    expect(byId["custom-auth"].homes.cairn.installed).toBe(true);
  });
});

describe("ensureEngine", () => {
  it("installs the capability's engine to its target home when absent", async () => {
    const pluginsInstall = vi.fn(async () => ({ ok: true, data: undefined }));
    const res = await ensureEngine("custom-endpoints", { homes, getPlugins: () => [], pluginsInstall } as any);
    expect(res.ok).toBe(true);
    expect(pluginsInstall).toHaveBeenCalledWith("cairn", "custom-auth", expect.stringContaining("custom-auth"), { homes });
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

describe("ensureEngineIn", () => {
  it("installs into the home it is told about, not the capability's first target", async () => {
    const calls: unknown[][] = [];
    const res = await ensureEngineIn("plugin-management", "opencode", {
      homes, getPlugins: () => [],
      pluginsInstall: async (...args: unknown[]) => { calls.push(args); return { ok: true, data: undefined }; },
    } as any);
    expect(res.ok).toBe(true);
    expect(calls).toEqual([["opencode", "plugin-updater", expect.stringContaining("plugin-updater"), { homes }]]);
  });

  // Cairn's own home has no app CLI to run an init through, so the bundled engine
  // clones the plugin in place like any other install.
  it("clones directly for Cairn's own home", async () => {
    const installs: string[] = [];
    const res = await ensureEngineIn("plugin-management", "cairn", {
      homes: homes.map((h) => (h.id === "cairn" ? { ...h, hasUpdater: false } : h)),
      getPlugins: () => [],
      pluginsInstall: async (homeId: string, name: string) => { installs.push(`${homeId}/${name}`); return { ok: true, data: undefined }; },
    } as any);
    expect(res.ok).toBe(true);
    expect(installs).toEqual(["cairn/plugin-updater"]);
  });

  // Without this the nested install re-resolves homes and can land in a completely
  // different home than the one being installed into.
  it("hands the nested install the same home list it was given", async () => {
    const seen: unknown[] = [];
    const targetHomes = homes.map((h) => (h.id === "cairn" ? { ...h, dir: "/tmp/somewhere", hasUpdater: false } : h));
    const res = await ensureEngineIn("plugin-management", "cairn", {
      homes: targetHomes,
      getPlugins: () => [],
      pluginsInstall: async (_homeId: string, _name: string, _url: string, deps?: { homes?: unknown }) => {
        seen.push(deps?.homes);
        return { ok: true, data: undefined };
      },
    } as any);
    expect(res.ok).toBe(true);
    expect(seen).toEqual([targetHomes]);
  });

  it("is a no-op when that home already has the engine", async () => {
    const pluginsInstall = vi.fn(async () => ({ ok: true, data: undefined }));
    const res = await ensureEngineIn("plugin-management", "cairn", { homes, getPlugins: () => [], pluginsInstall } as any);
    expect(res.ok).toBe(true);
    expect(pluginsInstall).not.toHaveBeenCalled();
  });

  it("errors on a home it does not know", async () => {
    const res = await ensureEngineIn("plugin-management", "ghost", { homes, getPlugins: () => [] } as any);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("ghost");
  });
});
