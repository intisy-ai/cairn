import { describe, it, expect, beforeAll, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let deployedManifests: typeof import("./capabilityOwner.js").deployedManifests;
let ownerOfCapability: typeof import("./capabilityOwner.js").ownerOfCapability;
let pluginProvidesCapability: typeof import("./capabilityOwner.js").pluginProvidesCapability;
let isDeployedPlugin: typeof import("./capabilityOwner.js").isDeployedPlugin;

// pluginDir() reaches @core's appIdForHome, which reads the real app registry unless pinned.
// vi.resetModules() only resets Vitest's own module graph; the compiled core-loader CommonJS
// deps are loaded through Node's native require(), so clearing require.cache too is what
// actually forces them to re-evaluate against the pin instead of serving a stale import.
beforeAll(async () => {
  const registryHome = mkdtempSync(join(tmpdir(), "cairn-caps-registry-"));
  process.env.HUB_CONFIG_DIR = registryHome;
  process.env.HUB_APPS_FILE = join(registryHome, "apps.json");

  vi.resetModules();
  for (const key of Object.keys(require.cache)) {
    if (/[\\/](core|core-loader)[\\/]dist[\\/]/.test(key)) delete require.cache[key];
  }

  ({ deployedManifests, ownerOfCapability, pluginProvidesCapability, isDeployedPlugin } = await import("./capabilityOwner.js"));
});

function homeWith(sidecars: Record<string, unknown>): string {
  const home = mkdtempSync(join(tmpdir(), "cairn-caps-"));
  const dir = join(home, "plugin");
  mkdirSync(dir, { recursive: true });
  for (const [id, manifest] of Object.entries(sidecars)) {
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(manifest));
    writeFileSync(join(dir, `${id}.js`), "export default {};");
  }
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  return home;
}

describe("capability ownership from the deployed sidecars", () => {
  it("names the plugin whose manifest declares a capability", () => {
    const home = homeWith({
      alpha: { id: "alpha", api: 1, entry: "dist/index.js", capabilities: ["screens"] },
      beta: { id: "beta", api: 1, entry: "dist/index.js", capabilities: ["custom-endpoints"], permissions: ["network"] },
    });
    expect(ownerOfCapability(home, "custom-endpoints")).toBe("beta");
    expect(pluginProvidesCapability(home, "alpha", "screens")).toBe(true);
    expect(pluginProvidesCapability(home, "alpha", "custom-endpoints")).toBe(false);
  });

  it("carries each manifest's declared permissions", () => {
    const home = homeWith({ beta: { id: "beta", api: 1, entry: "dist/index.js", capabilities: ["custom-endpoints"], permissions: ["network"] } });
    expect(deployedManifests(home)).toEqual([
      { id: "beta", capabilities: ["custom-endpoints"], permissions: ["network"], entryPath: join(home, "plugin", "beta.js") },
    ]);
  });

  it("answers null for a capability nothing declares and for an unreadable home", () => {
    expect(ownerOfCapability(homeWith({}), "screens")).toBeNull();
    expect(ownerOfCapability(join(tmpdir(), "cairn-caps-absent"), "screens")).toBeNull();
    expect(deployedManifests(join(tmpdir(), "cairn-caps-absent"))).toEqual([]);
  });

  it("does not treat the deploy directory's own package.json as a plugin", () => {
    const home = homeWith({ alpha: { id: "alpha", api: 1, entry: "dist/index.js", capabilities: ["screens"] } });
    expect(deployedManifests(home).map((m) => m.id)).toEqual(["alpha"]);
    expect(isDeployedPlugin(home, "package")).toBe(false);
    expect(isDeployedPlugin(home, "alpha")).toBe(true);
  });
});
