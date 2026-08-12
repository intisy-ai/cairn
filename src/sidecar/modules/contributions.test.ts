import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { screensList, settingsSections, CONTRIBUTIONS_NS, resetContributionsForTests } from "./contributions.js";
import type { Contributions } from "./contributions.js";
import { writeCache, readCache, resetCacheForTests } from "../lib/cache.js";
import type { PluginConfigSchema, PluginHome, PluginScreen } from "../../../packages/shared/src/domain.js";

function home(id: string, label: string, overrides: Partial<PluginHome> = {}): PluginHome {
  return { id, label, dir: `/${id}`, present: true, hasUpdater: true, ...overrides };
}

const HOMES = [home("cairn", "Cairn"), home("claude", "Claude Code"), home("opencode", "OpenCode")];

let cacheDir: string;

beforeEach(() => {
  resetCacheForTests();
  resetContributionsForTests();
  if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
  cacheDir = mkdtempSync(join(tmpdir(), "cairn-contributions-"));
});

function screenSpec(id: string, extra: Partial<PluginScreen> = {}): PluginScreen {
  return { plugin: "", id, label: id, layout: { kind: "stack" }, homes: [], ...extra };
}

function schema(plugin: string, screen?: PluginScreen): PluginConfigSchema {
  return { plugin, defaults: {}, current: {}, ...(screen ? { screens: [screen] } : {}) };
}

function withSections(plugin: string, sections: NonNullable<PluginConfigSchema["sections"]>): PluginConfigSchema {
  return { plugin, defaults: {}, current: {}, sections };
}

function withScreens(plugin: string, screens: PluginScreen[]): PluginConfigSchema {
  return { plugin, defaults: {}, current: {}, screens };
}

describe("screensList", () => {
  it("lists a screen per contributing plugin, with the homes that offer it", async () => {
    const result = await screensList({ wait: true }, {
      cacheDir,
      homes: HOMES,
      schemas: async (homeId) =>
        homeId === "claude"
          ? [schema("ledger", screenSpec("ledger", { label: "Ledger" }))]
          : [schema("ledger", screenSpec("ledger", { label: "Ledger" })), schema("updater", screenSpec("updater", { label: "Aa", order: 1 }))],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual([
      { plugin: "updater", id: "updater", label: "Aa", order: 1, layout: { kind: "stack" }, homes: ["cairn", "opencode"] },
      { plugin: "ledger", id: "ledger", label: "Ledger", layout: { kind: "stack" }, homes: ["cairn", "claude", "opencode"] },
    ]);
  });

  it("ignores a plugin that declares no screen", async () => {
    const result = await screensList({ wait: true }, { cacheDir, homes: HOMES, schemas: async () => [schema("quiet")] });
    expect(result.ok && result.data).toEqual([]);
  });

  it("carries the declared glyph through", async () => {
    const result = await screensList({ wait: true }, { cacheDir, homes: [HOMES[0]], schemas: async () => [schema("p", screenSpec("s", { label: "P", glyph: "@" }))] });
    expect(result.ok && result.data[0].glyph).toBe("@");
  });

  // Sorting keeps the sidebar stable across reloads: a declared order first, then label.
  it("sorts by declared order before label", async () => {
    const result = await screensList({ wait: true }, {
      cacheDir,
      homes: [HOMES[0]],
      schemas: async () => [
        schema("a", screenSpec("a", { label: "Zulu", order: 1 })),
        schema("b", screenSpec("b", { label: "Alpha" })),
        schema("c", screenSpec("c", { label: "Bravo", order: 2 })),
      ],
    });
    expect(result.ok && result.data.map((s) => s.label)).toEqual(["Zulu", "Bravo", "Alpha"]);
  });

  it("skips a home whose schemas cannot be read rather than failing the whole list", async () => {
    const result = await screensList({ wait: true }, {
      cacheDir,
      homes: HOMES,
      schemas: async (homeId) => {
        if (homeId === "claude") throw new Error("probe exploded");
        return [schema("p", screenSpec("s", { label: "P" }))];
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual([{ plugin: "p", id: "s", label: "P", layout: { kind: "stack" }, homes: ["cairn", "opencode"] }]);
  });

  it("does not probe an app home that is not installed", async () => {
    const asked: string[] = [];
    await screensList({ wait: true }, {
      cacheDir,
      homes: [home("cairn", "Cairn"), home("claude", "Claude Code", { present: false })],
      schemas: async (homeId) => { asked.push(homeId); return []; },
    });
    expect(asked).toEqual(["cairn"]);
  });

  it("takes the first home's presentation when two homes declare the same plugin differently", async () => {
    const result = await screensList({ wait: true }, {
      cacheDir,
      homes: [HOMES[0], HOMES[1]],
      schemas: async (homeId) => [schema("p", screenSpec("s", homeId === "cairn" ? { label: "First" } : { label: "Second" }))],
    });
    expect(result.ok && result.data).toEqual([{ plugin: "p", id: "s", label: "First", layout: { kind: "stack" }, homes: ["cairn", "claude"] }]);
  });

  it("keeps two screens of the same plugin apart, and the same id of two plugins apart", async () => {
    const result = await screensList({ wait: true }, {
      cacheDir,
      homes: [HOMES[0]],
      schemas: async () => [
        withScreens("a", [screenSpec("one", { label: "One", order: 1 }), screenSpec("two", { label: "Two", order: 2 })]),
        withScreens("b", [screenSpec("one", { label: "B One", order: 3 })]),
      ],
    });
    expect(result.ok && result.data.map((s) => `${s.plugin}:${s.id}`)).toEqual(["a:one", "a:two", "b:one"]);
  });

  it("lists a screen declared in two homes once, naming both", async () => {
    const schema = { plugin: "p", defaults: {}, current: {}, screens: [{ id: "s", label: "S", layout: { kind: "stack" } }] };
    const result = await screensList({ wait: true }, {
      homes: [home("claude", "Claude Code"), home("opencode", "OpenCode")] as never,
      schemas: async () => [schema] as never,
      cacheDir,
    });
    expect(result.ok && result.data).toHaveLength(1);
    expect(result.ok && result.data[0].homes).toEqual(["claude", "opencode"]);
  });
});

describe("settingsSections", () => {
  const SYNC = { id: "sync", label: "Sync", order: 40, scope: "allHomes" as const, fields: ["enabled"], actions: ["sync"] };

  it("lists a section per plugin declaration, naming the plugin and the homes offering it", async () => {
    const result = await settingsSections({ wait: true }, {
      cacheDir,
      homes: [HOMES[1], HOMES[2]],
      schemas: async () => [withSections("sync-bridge", [SYNC])],
    });

    expect(result.ok && result.data).toEqual([
      { id: "sync", label: "Sync", order: 40, scope: "allHomes", plugin: "sync-bridge", homes: ["claude", "opencode"] },
    ]);
  });

  it("leaves the control lists out, since the schema already carries them", async () => {
    const result = await settingsSections({ wait: true }, { cacheDir, homes: [HOMES[0]], schemas: async () => [withSections("p", [SYNC])] });
    if (!result.ok) throw new Error("unreachable");
    expect(result.data[0]).not.toHaveProperty("fields");
    expect(result.data[0]).not.toHaveProperty("actions");
  });

  it("keeps two sections of the same plugin apart, and the same id of two plugins apart", async () => {
    const result = await settingsSections({ wait: true }, {
      cacheDir,
      homes: [HOMES[0]],
      schemas: async () => [
        withSections("a", [{ id: "one", label: "One", order: 1 }, { id: "two", label: "Two", order: 2 }]),
        withSections("b", [{ id: "one", label: "B One", order: 3 }]),
      ],
    });
    expect(result.ok && result.data.map((s) => `${s.plugin}:${s.id}`)).toEqual(["a:one", "a:two", "b:one"]);
  });

  it("sorts by declared order before label, like screens", async () => {
    const result = await settingsSections({ wait: true }, {
      cacheDir,
      homes: [HOMES[0]],
      schemas: async () => [withSections("p", [{ id: "z", label: "Zulu", order: 1 }, { id: "a", label: "Alpha" }, { id: "b", label: "Bravo", order: 2 }])],
    });
    expect(result.ok && result.data.map((s) => s.label)).toEqual(["Zulu", "Bravo", "Alpha"]);
  });

  it("ignores a plugin that contributes no section", async () => {
    const result = await settingsSections({ wait: true }, { cacheDir, homes: HOMES, schemas: async () => [schema("quiet", screenSpec("s", { label: "Quiet" }))] });
    expect(result.ok && result.data).toEqual([]);
  });
});

// The sidebar mounts on every launch, and probing every plugin of every home there is what
// made the sidecar miss its deadline. So the default answer is whatever was learned last
// time, and the probing happens only when a caller explicitly waits for fresh data.
describe("contributions cache", () => {
  const cached = (value: Contributions) => writeCache(CONTRIBUTIONS_NS, "contributions", value, cacheDir);

  it("answers from cache without probing anything", async () => {
    cached({
      screens: [{ plugin: "p", id: "s", label: "P", layout: { kind: "stack" }, homes: ["claude"] }],
      sections: [{ plugin: "s", id: "x", label: "X", homes: ["claude"] }],
    });
    const schemas = vi.fn(async () => []);

    const screens = await screensList({}, { cacheDir, homes: HOMES, schemas });
    const sections = await settingsSections({}, { cacheDir, homes: HOMES, schemas });

    expect(schemas).not.toHaveBeenCalled();
    expect(screens.ok && screens.data.map((s) => s.plugin)).toEqual(["p"]);
    expect(sections.ok && sections.data.map((s) => s.id)).toEqual(["x"]);
  });

  it("returns nothing on a cold cache rather than making the sidebar wait", async () => {
    const schemas = vi.fn(async () => [schema("p", screenSpec("s", { label: "P" }))]);

    const result = await screensList({}, { cacheDir, homes: HOMES, schemas });

    expect(result.ok && result.data).toEqual([]);
    expect(schemas).not.toHaveBeenCalled();
  });

  it("stores what a waiting refresh learned, so the next launch paints immediately", async () => {
    await screensList({ wait: true }, { cacheDir, homes: [HOMES[0]], schemas: async () => [schema("p", screenSpec("s", { label: "P" }))] });

    expect(readCache<Contributions>(CONTRIBUTIONS_NS, "contributions", cacheDir)?.value).toEqual({
      screens: [{ plugin: "p", id: "s", label: "P", layout: { kind: "stack" }, homes: ["cairn"] }],
      sections: [],
    });
    const schemas = vi.fn(async () => []);
    const cachedScreens = await screensList({}, { cacheDir, homes: [HOMES[0]], schemas });
    expect(cachedScreens.ok && cachedScreens.data.map((s) => s.plugin)).toEqual(["p"]);
    expect(schemas).not.toHaveBeenCalled();
  });

  // One pass answers both, which is the reason they share a module at all.
  it("collapses concurrent refreshes into a single probe pass", async () => {
    let passes = 0;
    const schemas = async (): Promise<PluginConfigSchema[]> => {
      passes += 1;
      await new Promise((r) => setTimeout(r, 10));
      return [schema("p", screenSpec("s", { label: "P" })), withSections("q", [{ id: "s", label: "S" }])];
    };

    const [screens, sections] = await Promise.all([
      screensList({ wait: true }, { cacheDir, homes: [HOMES[0]], schemas }),
      settingsSections({ wait: true }, { cacheDir, homes: [HOMES[0]], schemas }),
    ]);

    expect(passes).toBe(1);
    expect(screens.ok && screens.data.map((s) => s.plugin)).toEqual(["p"]);
    expect(sections.ok && sections.data.map((s) => s.plugin)).toEqual(["q"]);
  });

  it("treats a pre-upgrade cache (the old menus/sections shape) as a cold cache rather than crashing", async () => {
    writeCache(CONTRIBUTIONS_NS, "contributions", { menus: [{ plugin: "p", id: "s", label: "P" }], sections: [] } as never, cacheDir);
    const schemas = vi.fn(async () => []);

    const result = await screensList({}, { cacheDir, homes: HOMES, schemas });

    expect(result).toEqual({ ok: true, data: [] });
    expect(schemas).not.toHaveBeenCalled();
  });

  it("drops a contribution from the cache once the plugin stops making it", async () => {
    cached({
      screens: [{ plugin: "gone", id: "g", label: "Gone", layout: { kind: "stack" }, homes: ["cairn"] }],
      sections: [{ plugin: "gone", id: "g", label: "G", homes: ["cairn"] }],
    });

    const result = await screensList({ wait: true }, { cacheDir, homes: [HOMES[0]], schemas: async () => [] });

    expect(result.ok && result.data).toEqual([]);
    expect(readCache<Contributions>(CONTRIBUTIONS_NS, "contributions", cacheDir)?.value).toEqual({ screens: [], sections: [] });
  });
});
