import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverApps } from "./appDiscovery.js";
import { getApps, registerApp } from "@core/index.js";
import type { AppDescriptor } from "@core/index.js";
import type { CatalogResult } from "../../../packages/shared/src/domain.js";

const gammaApp: AppDescriptor = {
  id: "gamma",
  label: "Gamma CLI",
  home: { candidates: ["/nonexistent/gamma-home"] },
  detect: { binary: "gamma", pkg: "gamma-cli" },
  loader: { id: "gamma-loader", url: "acme-org/gamma-loader" },
  commandsSubdir: "commands",
  proxyPort: 41001,
  integration: "env-baseurl",
  wireFormat: "generic-wire",
};

function emptyScan(): Promise<CatalogResult> {
  return Promise.resolve({ entries: [], source: "anonymous", org: "acme-org" });
}

function scanWithLoader(app: AppDescriptor): () => Promise<CatalogResult> {
  return () =>
    Promise.resolve({
      entries: [{ name: app.loader!.id, url: `https://github.com/acme-org/${app.loader!.id}`, kind: "loader", description: "", deprecated: false, topics: ["app-loader"], app }],
      source: "env",
      org: "acme-org",
    });
}

describe("discoverApps", () => {
  let tempDir: string;
  let savedHubAppsFile: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "app-discovery-"));
    savedHubAppsFile = process.env.HUB_APPS_FILE;
    process.env.HUB_APPS_FILE = join(tempDir, "apps.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (savedHubAppsFile === undefined) delete process.env.HUB_APPS_FILE;
    else process.env.HUB_APPS_FILE = savedHubAppsFile;
  });

  it("registers an org-scan loader entry that carries an app block", async () => {
    expect(getApps()).toEqual([]);
    await discoverApps({ scanOrgFn: scanWithLoader(gammaApp), exists: () => false });
    const apps = getApps();
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe("gamma");
    expect(apps[0].label).toBe("Gamma CLI");
  });

  it("performs no write on a second call with identical data", async () => {
    await discoverApps({ scanOrgFn: scanWithLoader(gammaApp), exists: () => false });
    const registered: AppDescriptor[] = [];
    await discoverApps({
      scanOrgFn: scanWithLoader(gammaApp),
      exists: () => false,
      registerAppFn: (desc) => {
        registered.push(desc);
        registerApp(desc);
      },
    });
    expect(registered).toEqual([]);
  });

  it("registers nothing for a loader-kind entry without an app block", async () => {
    const scan = () =>
      Promise.resolve({
        entries: [{ name: "gamma-loader", url: "https://github.com/acme-org/gamma-loader", kind: "loader" as const, description: "", deprecated: false, topics: ["app-loader"] }],
        source: "env" as const,
        org: "acme-org",
      });
    await discoverApps({ scanOrgFn: scan, exists: () => false });
    expect(getApps()).toEqual([]);
  });

  it("does not throw and registers nothing when the org scan is empty (no token)", async () => {
    await expect(discoverApps({ scanOrgFn: emptyScan, exists: () => false })).resolves.toBeUndefined();
    expect(getApps()).toEqual([]);
  });

  it("refreshes a known app from its installed loader's on-disk cairn.json", async () => {
    registerApp(gammaApp);
    const updated: AppDescriptor = { ...gammaApp, label: "Gamma CLI (updated)" };
    const readFile = (path: string) => {
      expect(path).toContain(join("repos", "gamma-loader", "cairn.json"));
      return JSON.stringify({ app: updated });
    };
    await discoverApps({ scanOrgFn: emptyScan, exists: () => true, readFile });
    expect(getApps().find((a) => a.id === "gamma")?.label).toBe("Gamma CLI (updated)");
  });

  it("never throws when the installed manifest is malformed", async () => {
    registerApp(gammaApp);
    await expect(
      discoverApps({ scanOrgFn: emptyScan, exists: () => true, readFile: () => "{ not json" }),
    ).resolves.toBeUndefined();
    expect(getApps().find((a) => a.id === "gamma")?.label).toBe("Gamma CLI");
  });
});
