import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadInstalledProxyDefs, resetProxyDefCacheForTests } from "./proxyPlugins.js";
import type { AppDescriptor } from "@core/index.js";

// isProxyDef (see proxyPlugins.ts) validates a loaded proxyDef's `app` id against
// getAppDescriptor(), which now reads solely from the apps.json registry, so
// these fixtures need a seeded "claude" entry for the proxyDef.app to resolve.
const claudeApp: AppDescriptor = {
  id: "claude",
  label: "Claude Code",
  home: { candidates: ["/nonexistent/claude-home"] },
  detect: { binary: "claude", pkg: "claude-code" },
  commandsSubdir: "commands",
  proxyPort: 41101,
  integration: "native",
  wireFormat: "anthropic",
};

let appsRegistryDir: string;
let savedHubAppsFile: string | undefined;

beforeEach(() => {
  appsRegistryDir = mkdtempSync(join(tmpdir(), "proxy-plugins-registry-"));
  savedHubAppsFile = process.env.HUB_APPS_FILE;
  process.env.HUB_APPS_FILE = join(appsRegistryDir, "apps.json");
  writeFileSync(process.env.HUB_APPS_FILE, JSON.stringify({ claude: claudeApp }));
});

afterEach(() => {
  rmSync(appsRegistryDir, { recursive: true, force: true });
  if (savedHubAppsFile === undefined) delete process.env.HUB_APPS_FILE;
  else process.env.HUB_APPS_FILE = savedHubAppsFile;
});

function seedStore(storeDir: string, names: string[]): void {
  mkdirSync(join(storeDir, "config"), { recursive: true });
  const plugins = names.map((name) => ({ name, url: `https://github.com/intisy-ai/${name}`, enabled: true }));
  writeFileSync(join(storeDir, "config", "plugins.json"), JSON.stringify(plugins));
  for (const name of names) {
    const distDir = join(storeDir, "repos", name, "dist");
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, "index.js"), "export const proxyDef = {};\n");
  }
}

function bumpMtime(path: string): void {
  const future = new Date(Date.now() + 60_000);
  utimesSync(path, future, future);
}

describe("loadInstalledProxyDefs", () => {
  let tempDir: string;

  afterEach(() => {
    resetProxyDefCacheForTests();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads duck-typed proxyDef from installed *-proxy repos only", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "proxy-plugins-"));
    seedStore(tempDir, ["fake-proxy", "stub-auth"]);
    const defs = await loadInstalledProxyDefs(tempDir, {
      importFn: async (url) =>
        url.includes("fake-proxy") ? { proxyDef: { app: "claude", label: "Claude Code", profile: () => ({}) } } : {},
    });
    expect(defs).toHaveLength(1);
    expect(defs[0].app).toBe("claude");
  });

  it("skips repos whose export is missing or malformed", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "proxy-plugins-"));
    seedStore(tempDir, ["bad-proxy"]);
    const defs = await loadInstalledProxyDefs(tempDir, { importFn: async () => ({ proxyDef: { app: "claude" } }) });
    expect(defs).toEqual([]);
  });

  it("caches per dist mtime and reloads after change", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "proxy-plugins-"));
    seedStore(tempDir, ["fake-proxy"]);
    let hits = 0;
    const urls: string[] = [];
    const importFn = async (url: string) => {
      urls.push(url);
      hits++;
      return { proxyDef: { app: "claude", label: "C", profile: () => ({}) } };
    };
    await loadInstalledProxyDefs(tempDir, { importFn });
    await loadInstalledProxyDefs(tempDir, { importFn });
    expect(hits).toBe(1);

    bumpMtime(join(tempDir, "repos", "fake-proxy", "dist", "index.js"));
    await loadInstalledProxyDefs(tempDir, { importFn });
    expect(hits).toBe(2);
    expect(urls[1]).not.toBe(urls[0]);
  });
});
