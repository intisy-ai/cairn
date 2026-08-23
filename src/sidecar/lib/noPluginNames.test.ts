import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// Every plugin and app-proxy repository in the ecosystem. A dashboard that must scale to an
// unbounded number of plugins may not name one.
const PLUGIN_NAMES = [
  "plugin-updater", "config-ledger", "sync-bridge", "wakatime-sync",
  "antigravity-auth", "claude-code-auth", "custom-auth", "stub-auth",
  "claude-code-proxy", "opencode-proxy", "claude-code-loader", "opencode-loader",
];

// The install-engine seam, deferred to the Java-first rework: Cairn calls fifteen plugin-updater
// entry points and the plugin-management capability covers five, so the ten uncovered ones keep the
// named library import until that capability is complete. Nothing else may be listed here.
const INSTALL_ENGINE = [
  "src/sidecar/lib/optionalEngines.ts",
  "src/sidecar/modules/plugins.ts",
  "src/sidecar/modules/appConfig.ts",
  "src/installer/index.ts",
  "src/renderer/lib/routes/Settings.svelte",
  "src/renderer/lib/components/AutoUpdateSettings.svelte",
];

// Classifying a repository nobody has fetched yet. A user typing a URL into the add-plugin dialog
// has no manifest to read, so a name heuristic is the only synchronous answer available, and it
// stays legitimate however the plugin system evolves. The INSTALLED case prefers the catalog's
// declared kind and reaches this only as a fallback.
const NAME_HEURISTIC = ["packages/shared/src/repoRef.ts"];

const SKIP_DIRS = ["node_modules", "dist", "out", "core", "core-auth", "core-loader", "core-proxy", "gallery", "__live__", "vendor", "graphify-out", "fixtures"];

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.includes(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { sources(path, found); continue; }
    if (!/\.(ts|svelte)$/.test(entry)) continue;
    if (/\.test\.(ts|svelte)$/.test(entry)) continue;
    found.push(path);
  }
  return found;
}

// Comments are stripped before scanning: a comment naming a plugin as an example is legitimate,
// and a comment-inclusive guard would need an allowlist long enough to hide a real branch.
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("Cairn names no plugin", () => {
  it("has no plugin name in any source file outside the install-engine seam", () => {
    const offenders: string[] = [];
    for (const file of [...sources(join(ROOT, "src")), ...sources(join(ROOT, "packages", "shared", "src"))]) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (INSTALL_ENGINE.includes(rel)) continue;
      const body = code(readFileSync(file, "utf8"));
      for (const name of PLUGIN_NAMES) {
        if (body.includes(name)) offenders.push(`${rel}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the allowlist honest: every listed file still names a plugin", () => {
    const inert: string[] = [];
    for (const rel of INSTALL_ENGINE) {
      const body = code(readFileSync(join(ROOT, rel), "utf8"));
      if (!PLUGIN_NAMES.some((name) => body.includes(name))) inert.push(rel);
    }
    expect(inert).toEqual([]);
  });

  it("does not select a plugin by a naming convention", () => {
    const offenders: string[] = [];
    for (const file of [...sources(join(ROOT, "src")), ...sources(join(ROOT, "packages", "shared", "src"))]) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (NAME_HEURISTIC.includes(rel)) continue;
      const body = code(readFileSync(file, "utf8"));
      if (/endsWith\(\s*["'`]-(proxy|auth|loader|sync|translator)["'`]\s*\)/.test(body)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the name-heuristic allowlist honest: every listed file still uses one", () => {
    const inert: string[] = [];
    for (const rel of NAME_HEURISTIC) {
      const body = code(readFileSync(join(ROOT, rel), "utf8"));
      if (!/endsWith\(\s*["'`]-(proxy|auth|loader|sync|translator)["'`]\s*\)/.test(body)) inert.push(rel);
    }
    expect(inert).toEqual([]);
  });
});
