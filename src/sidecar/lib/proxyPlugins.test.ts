import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadInstalledProxyDefs, resetProxyDefCacheForTests } from "./proxyPlugins.js";

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
    const importFn = async () => {
      hits++;
      return { proxyDef: { app: "claude", label: "C", profile: () => ({}) } };
    };
    await loadInstalledProxyDefs(tempDir, { importFn });
    await loadInstalledProxyDefs(tempDir, { importFn });
    expect(hits).toBe(1);

    bumpMtime(join(tempDir, "repos", "fake-proxy", "dist", "index.js"));
    await loadInstalledProxyDefs(tempDir, { importFn });
    expect(hits).toBe(2);
  });
});
