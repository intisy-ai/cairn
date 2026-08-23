import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginHome } from "../../../packages/shared/src/domain.js";

// What the home's manager answers for its npm plugins. `realManifests` is not injectable on
// purpose: the point of these cases is that the derivation from the sidecars plus that answer is
// exercised, not stubbed past.
const npmListed = vi.fn(async () => [] as { name: string; entryPath?: string }[]);

vi.mock("../lib/pluginManager.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/pluginManager.js")>()),
  readPluginManagement: async (_dir: string, _app: string, _op: string, fallback: unknown, work: (capability: unknown) => Promise<unknown>) => {
    try {
      return await work({ listNpm: npmListed });
    } catch {
      return fallback;
    }
  },
}));

function makeHome(): { dir: string; home: PluginHome } {
  const dir = mkdtempSync(join(tmpdir(), "dash-manifests-"));
  mkdirSync(join(dir, "config"), { recursive: true });
  mkdirSync(join(dir, "plugin"), { recursive: true });
  return { dir, home: { id: "claude", label: "Claude Code", dir, present: true, managesPlugins: true } };
}

/** A deployed plugin: the bundle plus the manifest sidecar beside it. */
function deploy(dir: string, id: string, config: Record<string, unknown>): void {
  writeFileSync(join(dir, "plugin", `${id}.js`), "// bundle placeholder", "utf8");
  writeFileSync(join(dir, "plugin", `${id}.json`), JSON.stringify({ id, api: 1, entry: "dist/index.js", config: { defaults: config } }), "utf8");
}

/** An npm plugin: a package with its own manifest, and the entry file the manager resolved. */
function packageAt(dir: string, id: string, config: Record<string, unknown>): string {
  const root = join(dir, "node_modules", id);
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "plugin.json"), JSON.stringify({ id, api: 1, entry: "dist/index.js", config: { defaults: config } }), "utf8");
  const entry = join(root, "dist", "index.js");
  writeFileSync(entry, "export default {};", "utf8");
  return entry;
}

async function schemasOf(home: PluginHome): Promise<string[]> {
  const { configSchemas } = await import("./appConfig.js");
  const result = await configSchemas("claude", { homes: [home], settingsProviders: async () => [] });
  if (!result.ok) throw new Error(result.error);
  return result.data.map((schema) => schema.plugin);
}

describe("what a home holds a manifest for", () => {
  it("reads an npm plugin's own package manifest beside the deployed sidecars", async () => {
    const { dir, home } = makeHome();
    deploy(dir, "cloned", { a: 1 });
    npmListed.mockResolvedValueOnce([{ name: "from-npm", entryPath: packageAt(dir, "from-npm", { b: 2 }) }]);

    expect(await schemasOf(home)).toEqual(["cloned", "from-npm"]);
  });

  it("skips an npm plugin whose package resolves to nothing", async () => {
    const { home } = makeHome();
    npmListed.mockResolvedValueOnce([{ name: "from-npm" }]);
    expect(await schemasOf(home)).toEqual([]);
  });

  it("skips an npm plugin whose package carries no manifest", async () => {
    const { dir, home } = makeHome();
    const root = join(dir, "node_modules", "bare");
    mkdirSync(join(root, "dist"), { recursive: true });
    const entry = join(root, "dist", "index.js");
    writeFileSync(entry, "export default {};", "utf8");
    npmListed.mockResolvedValueOnce([{ name: "bare", entryPath: entry }]);

    expect(await schemasOf(home)).toEqual([]);
  });

  it("lists a plugin present both ways once, as the copy this home deploys", async () => {
    const { dir, home } = makeHome();
    deploy(dir, "both", { deployed: true });
    npmListed.mockResolvedValueOnce([{ name: "both", entryPath: packageAt(dir, "both", { deployed: false }) }]);

    const { configSchemas } = await import("./appConfig.js");
    const result = await configSchemas("claude", { homes: [home], settingsProviders: async () => [] });
    if (!result.ok) throw new Error(result.error);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].defaults).toEqual({ deployed: true });
  });

  it("reads only the deployed sidecars when nothing manages this home's npm plugins", async () => {
    const { dir, home } = makeHome();
    deploy(dir, "cloned", { a: 1 });
    npmListed.mockRejectedValueOnce(new Error("nothing answers here"));

    expect(await schemasOf(home)).toEqual(["cloned"]);
  });
});
