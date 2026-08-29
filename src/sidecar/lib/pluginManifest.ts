import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readCloneManifest } from "@intisy-ai/basekit";
import { reposDir } from "./storagePaths.js";
import { svgIconDataUri } from "./pluginIcon.js";

// What a plugin calls itself, its mark, and a mark per thing it deploys, all from its own manifest.
// Everything a surface shows about a plugin's identity comes from here, so a plugin adds a logo by
// shipping a file and naming it, and nothing else knows about it.
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
  const manifest = readCloneManifest(repoDir);
  if (!manifest) return {};

  const out: PluginManifest = {};
  if (typeof manifest.displayName === "string" && manifest.displayName) out.displayName = manifest.displayName;
  const icon = readIcon(repoDir, manifest.icon);
  if (icon) out.icon = icon;

  if (manifest.icons && typeof manifest.icons === "object" && !Array.isArray(manifest.icons)) {
    const providers: Record<string, string> = {};
    for (const [id, relative] of Object.entries(manifest.icons as Record<string, unknown>)) {
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
