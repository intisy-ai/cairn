import { describe, it, expect, vi } from "vitest";

const ledgerFor = vi.fn();
const quarantinedIn = vi.fn();
vi.mock("../lib/pluginHost.js", () => ({ ledgerFor, quarantinedIn }));

const homes = [
  { id: "cairn", label: "Cairn", dir: "/homes/cairn", present: true, hasUpdater: true },
  { id: "app-a", label: "App A", dir: "/homes/a", present: true, hasUpdater: true },
];

describe("pluginLedger", () => {
  it("returns one group per home, each carrying its plugins' relationships", async () => {
    ledgerFor.mockImplementation(async (dir: string) => (dir === "/homes/a" ? [{
      pluginId: "historian", status: "active",
      capabilitiesDeclared: ["screens", "config-history", "extra-widget"], capabilities: ["screens", "config-history"],
      services: { provides: ["historian:history"], consumes: ["accounts-store"] },
      topics: ["config.changed"], permissions: ["network"], unresolved: ["accounts-store"],
    }] : []));
    const { pluginLedger } = await import("./diagnostics.js");
    const result = await pluginLedger({ homes });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((group) => group.home.id)).toEqual(["cairn", "app-a"]);
    expect(result.data[1].rows[0]).toEqual({
      pluginId: "historian", status: "active",
      capabilitiesDeclared: ["screens", "config-history", "extra-widget"], capabilities: ["screens", "config-history"],
      provides: ["historian:history"], consumes: ["accounts-store"], unresolved: ["accounts-store"],
      topics: ["config.changed"], permissions: ["network"],
    });
    expect(ledgerFor).toHaveBeenCalledWith("/homes/cairn", "cairn");
    expect(ledgerFor).toHaveBeenCalledWith("/homes/a", "app-a");
  });

  it("carries a broken plugin's error and fix", async () => {
    ledgerFor.mockResolvedValue([{
      pluginId: "bad", status: "broken",
      capabilitiesDeclared: ["screens"], capabilities: [],
      services: { provides: [], consumes: [] }, topics: [], permissions: [], unresolved: [],
      error: { detail: "activate threw", fix: "fix the error activate threw, or disable the plugin" },
    }]);
    const { pluginLedger } = await import("./diagnostics.js");
    const result = await pluginLedger({ homes: [homes[0]] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].rows[0].error).toEqual({ detail: "activate threw", fix: "fix the error activate threw, or disable the plugin" });
  });
});

describe("pluginQuarantine", () => {
  it("flattens every home's refusals, naming the home", async () => {
    quarantinedIn.mockImplementation(async (dir: string) => (dir === "/homes/a"
      ? [{ pluginId: "bad", detail: "is in a dependency cycle: bad -> bad", fix: "break the cycle" }]
      : []));
    const { pluginQuarantine } = await import("./diagnostics.js");
    const result = await pluginQuarantine({ homes });
    expect(result).toEqual({ ok: true, data: [
      { homeId: "app-a", homeLabel: "App A", pluginId: "bad", detail: "is in a dependency cycle: bad -> bad", fix: "break the cycle" },
    ] });
    expect(quarantinedIn).toHaveBeenCalledWith("/homes/cairn", "cairn");
    expect(quarantinedIn).toHaveBeenCalledWith("/homes/a", "app-a");
  });
});
