import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reposDir } from "./storagePaths.js";
import { svgIconDataUri } from "./pluginIcon.js";

// A plugin's cairn.json: what it calls itself, its mark, and a mark per provider it
// deploys. Everything a surface shows about a plugin's identity comes from here, so a
// plugin adds a logo by shipping a file and naming it, and nothing else knows about it.
export interface PluginManifest {
  displayName?: string;
  icon?: string;
  providers?: Record<string, string>;
}

function readIcon(repoDir: string, relative: unknown): string | undefined {
  if (typeof relative !== "string" || !relative.endsWith(".svg")) return undefined;
  try {
    return svgIconDataUri(readFileSync(join(repoDir, relative), "utf-8"));
  } catch {
    return undefined;
  }
}

// Icons resolve to data URIs here rather than at each call site: the renderer receives
// something it can put straight in an <img>, and the size cap is applied once.
export function readPluginManifest(plugin: string, homeDir: string): PluginManifest {
  const repoDir = join(reposDir(homeDir), plugin);
  let manifest: { displayName?: unknown; icon?: unknown; providers?: unknown };
  try {
    manifest = JSON.parse(readFileSync(join(repoDir, "cairn.json"), "utf-8"));
  } catch {
    return {};
  }

  const out: PluginManifest = {};
  if (typeof manifest.displayName === "string" && manifest.displayName) out.displayName = manifest.displayName;
  const icon = readIcon(repoDir, manifest.icon);
  if (icon) out.icon = icon;

  if (manifest.providers && typeof manifest.providers === "object" && !Array.isArray(manifest.providers)) {
    const providers: Record<string, string> = {};
    for (const [id, relative] of Object.entries(manifest.providers as Record<string, unknown>)) {
      const resolved = readIcon(repoDir, relative);
      if (resolved) providers[id] = resolved;
    }
    if (Object.keys(providers).length > 0) out.providers = providers;
  }
  return out;
}

// A provider wears its own mark where it has one, the mark of the plugin that deploys it
// otherwise, and nothing at all when neither exists (the renderer draws a lettermark).
// One plugin can deploy several providers, which is the case a single plugin-level icon
// cannot serve.
export function providerIcon(manifest: PluginManifest, providerId: string): string | undefined {
  return manifest.providers?.[providerId] ?? manifest.icon;
}
