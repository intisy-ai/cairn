// plugin-updater is a hard dependency (Cairn's install engine), but its imports stay DYNAMIC:
// ESM hoists static imports, so PLUGIN_UPDATER_LIBRARY_MODE below would be set after its module
// body had already activated it against whatever home is ambient.
import type { Plugin } from "@intisy-ai/plugin-updater/dist/types.js";

// Every engine import in the app goes through this module, so this is the one place that
// can promise an engine is loaded as a library: plugin-updater's entry otherwise activates
// itself on import and would run against whatever home happens to be ambient.
process.env.PLUGIN_UPDATER_LIBRARY_MODE = "1";

type PluginUpdaterConfig = typeof import("@intisy-ai/plugin-updater/dist/config.js");
type PluginUpdaterCache = typeof import("@intisy-ai/plugin-updater/dist/cache.js");
type PluginUpdaterSyncbridge = typeof import("@intisy-ai/plugin-updater/dist/syncbridge.js");
type PluginUpdaterEnv = typeof import("@intisy-ai/plugin-updater/dist/env.js");
type PluginUpdaterNpm = typeof import("@intisy-ai/plugin-updater/dist/npm.js");
type PluginUpdaterIndex = typeof import("@intisy-ai/plugin-updater/dist/index.js");

const cache = new Map<string, Promise<unknown>>();
const loggedFailures = new Set<string>();

// A missing sibling repo surfaces as ERR_MODULE_NOT_FOUND (or the CJS-era MODULE_NOT_FOUND/ENOENT
// equivalents): that is the expected "engine not installed" case and stays silent. Any other
// failure (a syntax error, a throw during the module's top-level init, a packaging regression)
// means the engine IS present but broken, which must not be indistinguishable from "not installed".
function isModuleNotFound(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND" || code === "ENOENT";
}

function loadOnce<T>(specifier: string, doImport: () => Promise<T>): () => Promise<T | null> {
  return () => {
    const existing = cache.get(specifier) as Promise<T | null> | undefined;
    if (existing) return existing;
    const loaded = doImport().catch((error: unknown) => {
      if (!isModuleNotFound(error) && !loggedFailures.has(specifier)) {
        loggedFailures.add(specifier);
        console.error(`optional engine "${specifier}" failed to load, treating as unavailable:`, error);
      }
      return null;
    });
    cache.set(specifier, loaded);
    return loaded;
  };
}

export const loadPluginUpdaterConfig = loadOnce<PluginUpdaterConfig>("@intisy-ai/plugin-updater/dist/config.js", () => import("@intisy-ai/plugin-updater/dist/config.js"));
export const loadPluginUpdaterCache = loadOnce<PluginUpdaterCache>("@intisy-ai/plugin-updater/dist/cache.js", () => import("@intisy-ai/plugin-updater/dist/cache.js"));
export const loadPluginUpdaterSyncbridge = loadOnce<PluginUpdaterSyncbridge>("@intisy-ai/plugin-updater/dist/syncbridge.js", () => import("@intisy-ai/plugin-updater/dist/syncbridge.js"));
export const loadPluginUpdaterEnv = loadOnce<PluginUpdaterEnv>("@intisy-ai/plugin-updater/dist/env.js", () => import("@intisy-ai/plugin-updater/dist/env.js"));
export const loadPluginUpdaterNpm = loadOnce<PluginUpdaterNpm>("@intisy-ai/plugin-updater/dist/npm.js", () => import("@intisy-ai/plugin-updater/dist/npm.js"));
export const loadPluginUpdaterIndex = loadOnce<PluginUpdaterIndex>("@intisy-ai/plugin-updater/dist/index.js", () => import("@intisy-ai/plugin-updater/dist/index.js"));

export function resetOptionalEngineCacheForTests(): void {
  cache.clear();
}

// getPlugins (a home's plugins.json contents) is read by nearly every sidecar module; centralized
// here so an absent plugin-updater degrades once, consistently, to "no plugins" instead of each
// call site reimplementing the same fallback.
// Reports which of a plugin's declared build outputs are missing. Without the engine there is
// nothing that could repair it either, so "unknown" reads as healthy rather than alarming.
// Deliberately not the full health check: that spawns git for a head this never reads, which
// cost a subprocess per plugin on every listing.
export async function safeMissingArtifacts(dir: string, name: string): Promise<string[]> {
  try {
    const index = await loadPluginUpdaterIndex();
    return index ? index.missingPluginArtifacts(dir, name) : [];
  } catch {
    return [];
  }
}

export async function safeGetPlugins(dir: string): Promise<Plugin[]> {
  const mod = await loadPluginUpdaterConfig();
  return mod ? mod.getPlugins(dir) : [];
}
