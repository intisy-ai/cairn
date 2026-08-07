import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { menusList, MENUS_NS, resetMenusForTests } from "./menus.js";
import { writeCache, readCache, resetCacheForTests } from "../lib/cache.js";
import type { PluginConfigSchema, PluginHome } from "../../../packages/shared/src/domain.js";

function home(id: string, label: string, overrides: Partial<PluginHome> = {}): PluginHome {
  return { id, label, dir: `/${id}`, present: true, hasUpdater: true, ...overrides };
}

const HOMES = [home("cairn", "Cairn"), home("claude", "Claude Code"), home("opencode", "OpenCode")];

let cacheDir: string;

beforeEach(() => {
  resetCacheForTests();
  resetMenusForTests();
  if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
  cacheDir = mkdtempSync(join(tmpdir(), "cairn-menus-"));
});

function schema(plugin: string, menu?: PluginConfigSchema["menu"]): PluginConfigSchema {
  return { plugin, defaults: {}, current: {}, ...(menu ? { menu } : {}) };
}

describe("menusList", () => {
  it("lists a menu per contributing plugin, with the homes that offer it", async () => {
    const result = await menusList({ wait: true }, {
      cacheDir,
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
    const result = await menusList({ wait: true }, { cacheDir, homes: HOMES, schemas: async () => [schema("quiet")] });
    expect(result.ok && result.data).toEqual([]);
  });

  it("carries the declared glyph through", async () => {
    const result = await menusList({ wait: true }, { cacheDir, homes: [HOMES[0]], schemas: async () => [schema("p", { label: "P", glyph: "@" })] });
    expect(result.ok && result.data[0].glyph).toBe("@");
  });

  // Sorting keeps the sidebar stable across reloads: a declared order first, then label.
  it("sorts by declared order before label", async () => {
    const result = await menusList({ wait: true }, {
      cacheDir,
      homes: [HOMES[0]],
      schemas: async () => [schema("a", { label: "Zulu", order: 1 }), schema("b", { label: "Alpha" }), schema("c", { label: "Bravo", order: 2 })],
    });
    expect(result.ok && result.data.map((m) => m.label)).toEqual(["Zulu", "Bravo", "Alpha"]);
  });

  it("skips a home whose schemas cannot be read rather than failing the whole list", async () => {
    const result = await menusList({ wait: true }, {
      cacheDir,
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
    await menusList({ wait: true }, {
      cacheDir,
      homes: [home("cairn", "Cairn"), home("claude", "Claude Code", { present: false })],
      schemas: async (homeId) => { asked.push(homeId); return []; },
    });
    expect(asked).toEqual(["cairn"]);
  });

  it("takes the first home's presentation when two homes declare the same plugin differently", async () => {
    const result = await menusList({ wait: true }, {
      cacheDir,
      homes: [HOMES[0], HOMES[1]],
      schemas: async (homeId) => [schema("p", homeId === "cairn" ? { label: "First" } : { label: "Second" })],
    });
    expect(result.ok && result.data).toEqual([{ plugin: "p", label: "First", homes: ["cairn", "claude"] }]);
  });
});

// The sidebar mounts on every launch, and probing every plugin of every home there is what
// made the sidecar miss its deadline. So the default answer is whatever was learned last
// time, and the probing happens only when a caller explicitly waits for fresh data.
describe("menus cache", () => {
  it("answers from cache without probing anything", async () => {
    writeCache(MENUS_NS, "menus", [{ plugin: "p", label: "P", homes: ["claude"] }], cacheDir);
    const schemas = vi.fn(async () => []);

    const result = await menusList({}, { cacheDir, homes: HOMES, schemas });

    expect(schemas).not.toHaveBeenCalled();
    expect(result.ok && result.data.map((m) => m.plugin)).toEqual(["p"]);
  });

  it("returns nothing on a cold cache rather than making the sidebar wait", async () => {
    const schemas = vi.fn(async () => [schema("p", { label: "P" })]);

    const result = await menusList({}, { cacheDir, homes: HOMES, schemas });

    expect(result.ok && result.data).toEqual([]);
    expect(schemas).not.toHaveBeenCalled();
  });

  it("stores what a waiting refresh learned, so the next launch paints immediately", async () => {
    await menusList({ wait: true }, { cacheDir, homes: [HOMES[0]], schemas: async () => [schema("p", { label: "P" })] });

    expect(readCache<unknown[]>(MENUS_NS, "menus", cacheDir)?.value).toEqual([{ plugin: "p", label: "P", homes: ["cairn"] }]);
    const schemas = vi.fn(async () => []);
    const cached = await menusList({}, { cacheDir, homes: [HOMES[0]], schemas });
    expect(cached.ok && cached.data.map((m) => m.plugin)).toEqual(["p"]);
    expect(schemas).not.toHaveBeenCalled();
  });

  it("collapses concurrent refreshes into a single probe pass", async () => {
    let passes = 0;
    const schemas = async (): Promise<PluginConfigSchema[]> => {
      passes += 1;
      await new Promise((r) => setTimeout(r, 10));
      return [schema("p", { label: "P" })];
    };

    const [a, b] = await Promise.all([
      menusList({ wait: true }, { cacheDir, homes: [HOMES[0]], schemas }),
      menusList({ wait: true }, { cacheDir, homes: [HOMES[0]], schemas }),
    ]);

    expect(passes).toBe(1);
    expect(a.ok && a.data).toEqual(b.ok && b.data);
  });

  it("drops a plugin from the cache once it stops contributing a menu", async () => {
    writeCache(MENUS_NS, "menus", [{ plugin: "gone", label: "Gone", homes: ["cairn"] }], cacheDir);

    const result = await menusList({ wait: true }, { cacheDir, homes: [HOMES[0]], schemas: async () => [] });

    expect(result.ok && result.data).toEqual([]);
    expect(readCache<unknown[]>(MENUS_NS, "menus", cacheDir)?.value).toEqual([]);
  });
});
