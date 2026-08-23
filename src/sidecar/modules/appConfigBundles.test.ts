import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginHome } from "../../../packages/shared/src/domain.js";

// What the home's manager answers. `realBundles` is not injectable on purpose: the point of these
// cases is that the derivation from those two answers is exercised, not stubbed past.
const listed = vi.fn(async () => [] as { id: string }[]);
const npmListed = vi.fn(async () => [] as { name: string; entryPath?: string }[]);

vi.mock("../lib/pluginManager.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/pluginManager.js")>()),
  listedPlugins: (...args: unknown[]) => listed(...(args as [])),
  readPluginManagement: async (_dir: string, _app: string, _op: string, fallback: unknown, work: (capability: unknown) => Promise<unknown>) => {
    try {
      return await work({ listNpm: npmListed });
    } catch {
      return fallback;
    }
  },
}));

function makeHome(): { dir: string; home: PluginHome } {
  const dir = mkdtempSync(join(tmpdir(), "dash-bundles-"));
  mkdirSync(join(dir, "config"), { recursive: true });
  mkdirSync(join(dir, "plugin"), { recursive: true });
  return { dir, home: { id: "claude", label: "Claude Code", dir, present: true, managesPlugins: true } };
}

async function probedBundles(home: PluginHome): Promise<{ plugin: string; path: string }[]> {
  let seen: { plugin: string; path: string }[] = [];
  const { configSchemas } = await import("./appConfig.js");
  await configSchemas("claude", {
    homes: [home],
    settingsProviders: async () => [],
    declarations: async (bundles) => { seen = bundles; return new Map(); },
  });
  return seen;
}

describe("what a home offers for declaration", () => {
  it("offers an npm plugin's resolved package beside the deployed bundles", async () => {
    const { dir, home } = makeHome();
    writeFileSync(join(dir, "plugin", "cloned.js"), "// bundle placeholder", "utf8");
    listed.mockResolvedValueOnce([{ id: "cloned" }]);
    npmListed.mockResolvedValueOnce([{ name: "from-npm", entryPath: "/packages/from-npm/index.js" }]);

    expect(await probedBundles(home)).toEqual([
      { plugin: "cloned", path: join(dir, "plugin", "cloned.js") },
      { plugin: "from-npm", path: "/packages/from-npm/index.js" },
    ]);
  });

  it("skips an npm plugin whose package resolves to nothing", async () => {
    const { home } = makeHome();
    npmListed.mockResolvedValueOnce([{ name: "from-npm" }]);
    expect(await probedBundles(home)).toEqual([]);
  });

  it("offers a plugin present both ways as the copy this home deploys", async () => {
    const { dir, home } = makeHome();
    writeFileSync(join(dir, "plugin", "both.js"), "// bundle placeholder", "utf8");
    listed.mockResolvedValueOnce([{ id: "both" }]);
    npmListed.mockResolvedValueOnce([{ name: "both", entryPath: "/packages/both/index.js" }]);

    expect((await probedBundles(home))[0]).toEqual({ plugin: "both", path: join(dir, "plugin", "both.js") });
  });

  it("offers only the deployed bundles when nothing manages this home's npm plugins", async () => {
    const { dir, home } = makeHome();
    writeFileSync(join(dir, "plugin", "cloned.js"), "// bundle placeholder", "utf8");
    listed.mockResolvedValueOnce([{ id: "cloned" }]);
    npmListed.mockRejectedValueOnce(new Error("nothing answers here"));

    expect(await probedBundles(home)).toEqual([{ plugin: "cloned", path: join(dir, "plugin", "cloned.js") }]);
  });
});
