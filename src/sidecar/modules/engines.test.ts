import { describe, it, expect, vi } from "vitest";
import { enginesList, ensureEngine } from "./engines.js";

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
