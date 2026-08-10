import { describe, it, expect } from "vitest";
import { buildUnifiedLibraries, isOrphan } from "./unifiedLibraries.js";
import type { HomeLibraries, InstalledLibrary, PluginHome } from "@cairn/shared";

function home(id: string, label: string): PluginHome {
  return { id, label, dir: `/${id}`, present: true, hasUpdater: true };
}

function lib(specifier: string, version: string, usedBy: string[] = []): InstalledLibrary {
  return { specifier, version, usedBy };
}

describe("buildUnifiedLibraries", () => {
  // The whole point: the same library in two homes was listed twice, which read as two
  // libraries rather than one installed in two places.
  it("lists a library installed in two homes once, naming both homes", () => {
    const rows = buildUnifiedLibraries([
      { home: home("alpha", "Alpha"), shared: [lib("@intisy-ai/core", "1.2.0", ["antigravity-auth"])], plugins: [] },
      { home: home("beta", "Beta"), shared: [lib("@intisy-ai/core", "1.1.0", ["claude-code-auth"])], plugins: [] },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].specifier).toBe("@intisy-ai/core");
    expect(Object.keys(rows[0].homes).sort()).toEqual(["alpha", "beta"]);
  });

  // Two homes really can hold different versions, so one version per row would be a claim the
  // data does not support.
  it("keeps each home's own version", () => {
    const rows = buildUnifiedLibraries([
      { home: home("alpha", "Alpha"), shared: [lib("@intisy-ai/core", "1.2.0")], plugins: [] },
      { home: home("beta", "Beta"), shared: [lib("@intisy-ai/core", "1.1.0")], plugins: [] },
    ]);
    expect(rows[0].homes.alpha.version).toBe("1.2.0");
    expect(rows[0].homes.beta.version).toBe("1.1.0");
  });

  it("merges the plugins that use it across homes, without repeating one", () => {
    const rows = buildUnifiedLibraries([
      { home: home("alpha", "Alpha"), shared: [lib("@intisy-ai/core-auth", "1.0.0", ["antigravity-auth", "claude-code-auth"])], plugins: [] },
      { home: home("beta", "Beta"), shared: [lib("@intisy-ai/core-auth", "1.0.0", ["claude-code-auth"])], plugins: [] },
    ]);
    expect(rows[0].usedBy).toEqual(["antigravity-auth", "claude-code-auth"]);
  });

  // A plugin's declared dependency that never reached the shared store still deserves a row,
  // and the row has to say it is not installed rather than implying it is.
  it("records a declared dependency as declared but not installed", () => {
    const rows = buildUnifiedLibraries([
      {
        home: home("alpha", "Alpha"),
        shared: [],
        plugins: [{ plugin: "custom-auth", dependencies: [lib("@openauthjs/openauth", "")] }],
      },
    ]);

    expect(rows[0].specifier).toBe("@openauthjs/openauth");
    expect(rows[0].declaredBy).toEqual(["custom-auth"]);
    expect(rows[0].homes.alpha.installed).toBe(false);
  });

  it("sorts rows by specifier so the list does not reorder between reads", () => {
    const rows = buildUnifiedLibraries([
      { home: home("alpha", "Alpha"), shared: [lib("zed", "1"), lib("apex", "1")], plugins: [] },
    ]);
    expect(rows.map((r) => r.specifier)).toEqual(["apex", "zed"]);
  });

  it("returns nothing for homes with empty stores", () => {
    expect(buildUnifiedLibraries([{ home: home("alpha", "Alpha"), shared: [], plugins: [] }])).toEqual([]);
  });
});

describe("isOrphan", () => {
  it("calls a library nothing declares an orphan, and one in use not", () => {
    const rows = buildUnifiedLibraries([
      {
        home: home("alpha", "Alpha"),
        shared: [lib("@intisy-ai/left-behind", "1.0.0"), lib("@intisy-ai/core", "1.0.0", ["antigravity-auth"])],
        plugins: [],
      },
    ]);
    const orphan = rows.find((r) => r.specifier === "@intisy-ai/left-behind")!;
    const used = rows.find((r) => r.specifier === "@intisy-ai/core")!;
    expect(isOrphan(orphan)).toBe(true);
    expect(isOrphan(used)).toBe(false);
  });
});
