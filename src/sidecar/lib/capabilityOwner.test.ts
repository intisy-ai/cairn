import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deployedManifests, ownerOfCapability, pluginProvidesCapability, isDeployedPlugin } from "./capabilityOwner.js";

// Pinned so the registry lookup behind pluginDir() cannot read the developer's real apps.json.
// HUB_APPS_FILE is the one that matters here; it is read live per call, so no reimport is needed.
const registryHome = mkdtempSync(join(tmpdir(), "cairn-caps-registry-"));
process.env.HUB_CONFIG_DIR = registryHome;
process.env.HUB_APPS_FILE = join(registryHome, "apps.json");

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
    // A valid manifest at that filename, so only the by-name skip can exclude it: the id schema
    // permits an id of "package", and the marker owns that filename.
    writeFileSync(join(home, "plugin", "package.json"), JSON.stringify({ id: "package", api: 1, entry: "dist/index.js", capabilities: [] }));
    expect(deployedManifests(home).map((m) => m.id)).toEqual(["alpha"]);
    expect(isDeployedPlugin(home, "package")).toBe(false);
    expect(isDeployedPlugin(home, "alpha")).toBe(true);
  });
});
