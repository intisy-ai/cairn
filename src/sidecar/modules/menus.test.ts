import { describe, it, expect } from "vitest";
import { menusList } from "./menus.js";
import type { PluginConfigSchema, PluginHome } from "../../../packages/shared/src/domain.js";

function home(id: string, label: string, overrides: Partial<PluginHome> = {}): PluginHome {
  return { id, label, dir: `/${id}`, present: true, hasUpdater: true, ...overrides };
}

const HOMES = [home("cairn", "Cairn"), home("claude", "Claude Code"), home("opencode", "OpenCode")];

function schema(plugin: string, menu?: PluginConfigSchema["menu"]): PluginConfigSchema {
  return { plugin, defaults: {}, current: {}, ...(menu ? { menu } : {}) };
}

describe("menusList", () => {
  it("lists a menu per contributing plugin, with the homes that offer it", async () => {
    const result = await menusList({
      homes: HOMES,
      schemas: async (homeId) =>
        homeId === "claude"
          ? [schema("ledger", { label: "Ledger" })]
          : [schema("ledger", { label: "Ledger" }), schema("updater", { label: "Aa", order: 1 })],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual([
      { plugin: "updater", label: "Aa", order: 1, homes: ["cairn", "opencode"] },
      { plugin: "ledger", label: "Ledger", homes: ["cairn", "claude", "opencode"] },
    ]);
  });

  it("ignores a plugin that declares no menu", async () => {
    const result = await menusList({ homes: HOMES, schemas: async () => [schema("quiet")] });
    expect(result.ok && result.data).toEqual([]);
  });

  it("carries the declared glyph through", async () => {
    const result = await menusList({ homes: [HOMES[0]], schemas: async () => [schema("p", { label: "P", glyph: "@" })] });
    expect(result.ok && result.data[0].glyph).toBe("@");
  });

  // Sorting keeps the sidebar stable across reloads: a declared order first, then label.
  it("sorts by declared order before label", async () => {
    const result = await menusList({
      homes: [HOMES[0]],
      schemas: async () => [schema("a", { label: "Zulu", order: 1 }), schema("b", { label: "Alpha" }), schema("c", { label: "Bravo", order: 2 })],
    });
    expect(result.ok && result.data.map((m) => m.label)).toEqual(["Zulu", "Bravo", "Alpha"]);
  });

  it("skips a home whose schemas cannot be read rather than failing the whole list", async () => {
    const result = await menusList({
      homes: HOMES,
      schemas: async (homeId) => {
        if (homeId === "claude") throw new Error("probe exploded");
        return [schema("p", { label: "P" })];
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual([{ plugin: "p", label: "P", homes: ["cairn", "opencode"] }]);
  });

  it("does not probe an app home that is not installed", async () => {
    const asked: string[] = [];
    await menusList({
      homes: [home("cairn", "Cairn"), home("claude", "Claude Code", { present: false })],
      schemas: async (homeId) => { asked.push(homeId); return []; },
    });
    expect(asked).toEqual(["cairn"]);
  });

  it("takes the first home's presentation when two homes declare the same plugin differently", async () => {
    const result = await menusList({
      homes: [HOMES[0], HOMES[1]],
      schemas: async (homeId) => [schema("p", homeId === "cairn" ? { label: "First" } : { label: "Second" })],
    });
    expect(result.ok && result.data).toEqual([{ plugin: "p", label: "First", homes: ["cairn", "claude"] }]);
  });
});
