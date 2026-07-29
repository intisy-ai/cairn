import { describe, it, expect } from "vitest";
import { buildUnifiedPlugins } from "./unifiedPlugins.js";
import type { HomePlugins, CatalogEntry, PluginHome } from "@cairn/shared";

const homes: PluginHome[] = [
  { id: "cairn", label: "Cairn", dir: "/cairn", present: true, hasUpdater: true },
  { id: "claude", label: "Claude Code", dir: "/c", present: true, hasUpdater: true },
  { id: "opencode", label: "OpenCode", dir: "/o", present: true, hasUpdater: true },
];
const row = (name: string, extra: Partial<HomePlugins["rows"][number]> = {}) =>
  ({ name, kind: "git" as const, enabled: true, updateAvailable: false, description: "", ...extra });

describe("buildUnifiedPlugins", () => {
  it("aggregates an installed plugin across homes with applicable-home pills", () => {
    const sections: HomePlugins[] = [
      { home: homes[1], rows: [row("wakatime-sync", { description: "Tracks time" })] },
      { home: homes[2], rows: [] },
      { home: homes[0], rows: [] },
    ];
    const catalog: CatalogEntry[] = [{ name: "wakatime-sync", url: "u", kind: "plugin", description: "cat desc", deprecated: false }];
    const out = buildUnifiedPlugins(sections, catalog, homes);
    const wk = out.find((p) => p.name === "wakatime-sync")!;
    expect(wk.kind).toBe("plugin");
    expect(wk.description).toBe("Tracks time");
    // plugin kind applies to host apps only (not cairn)
    expect(Object.keys(wk.homes).sort()).toEqual(["claude", "opencode"]);
    expect(wk.homes.claude.installed).toBe(true);
    expect(wk.homes.opencode.installed).toBe(false);
  });

  it("routes a provider to host apps + cairn and a proxy to cairn only", () => {
    const catalog: CatalogEntry[] = [
      { name: "antigravity-auth", url: "u", kind: "provider", description: "prov", deprecated: false },
      { name: "claude-code-proxy", url: "u", kind: "proxy", description: "px", deprecated: false },
    ];
    const out = buildUnifiedPlugins([], catalog, homes);
    expect(Object.keys(out.find((p) => p.name === "antigravity-auth")!.homes).sort()).toEqual(["cairn", "claude", "opencode"]);
    expect(Object.keys(out.find((p) => p.name === "claude-code-proxy")!.homes)).toEqual(["cairn"]);
  });

  it("falls back to the catalog description when the installed row has none", () => {
    const sections: HomePlugins[] = [{ home: homes[1], rows: [row("demo", { description: "" })] }];
    const catalog: CatalogEntry[] = [{ name: "demo", url: "u", kind: "plugin", description: "from catalog", deprecated: false }];
    expect(buildUnifiedPlugins(sections, catalog, homes).find((p) => p.name === "demo")!.description).toBe("from catalog");
  });

  it("prefers installed displayName/icon, then catalog, then repo name", () => {
    const sections: HomePlugins[] = [{ home: homes[1], rows: [row("wakatime-sync", { displayName: "WakaTime", icon: "data:installed" })] }];
    const catalog: CatalogEntry[] = [{ name: "wakatime-sync", url: "u", kind: "plugin", description: "d", deprecated: false, topics: [], displayName: "Catalog Name", icon: "data:catalog" }];
    const p = buildUnifiedPlugins(sections, catalog, homes).find((x) => x.name === "wakatime-sync")!;
    expect(p.displayName).toBe("WakaTime");
    expect(p.icon).toBe("data:installed");
    const q = buildUnifiedPlugins([], [{ name: "foo-auth", url: "u", kind: "provider", description: "", deprecated: false, topics: [] }], homes).find((x) => x.name === "foo-auth")!;
    expect(q.displayName).toBe("foo-auth");
    expect(q.icon).toBe("");
  });

  it("carries catalog topics onto the unified plugin", () => {
    const catalog: CatalogEntry[] = [{ name: "antigravity-auth", url: "u", kind: "provider", description: "d", deprecated: false, topics: ["intisy-ai", "gemini"] }];
    const out = buildUnifiedPlugins([], catalog, homes);
    expect(out.find((p) => p.name === "antigravity-auth")!.topics).toEqual(["intisy-ai", "gemini"]);
  });

  it("excludes plugin-updater and marks updateAvailable if any home has an update", () => {
    const sections: HomePlugins[] = [{ home: homes[1], rows: [row("x", { updateAvailable: true }), row("plugin-updater")] }];
    const out = buildUnifiedPlugins(sections, [], homes);
    expect(out.some((p) => p.name === "plugin-updater")).toBe(false);
    expect(out.find((p) => p.name === "x")!.updateAvailable).toBe(true);
  });
});
