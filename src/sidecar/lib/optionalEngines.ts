// plugin-updater and config-ledger are OPTIONAL engine plugins: Cairn must build and run with
// either or both sibling repos absent, degrading the dependent feature instead of crashing (see
// electron.vite.config.ts's `external` entries, which stop the bundler from needing their dist
// files at build time). Every value-level use of `@plugin-updater/*` / `@config-ledger/*` goes
// through one of the presence-probed loaders below rather than a static import, so a missing
// engine surfaces as "feature unavailable", never an unhandled module-resolution crash. A miss is
// cached like a hit: these resolve through a fixed alias path, not something that can appear
// mid-run, so there is no benefit to retrying.
import type { Plugin } from "@plugin-updater/types.js";

type PluginUpdaterConfig = typeof import("@plugin-updater/config.js");
type PluginUpdaterCache = typeof import("@plugin-updater/cache.js");
type PluginUpdaterSyncbridge = typeof import("@plugin-updater/syncbridge.js");
type PluginUpdaterEnv = typeof import("@plugin-updater/env.js");
type PluginUpdaterNpm = typeof import("@plugin-updater/npm.js");
type PluginUpdaterIndex = typeof import("@plugin-updater/index.js");
type ConfigLedgerLib = typeof import("@config-ledger/lib.js");

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

export const loadPluginUpdaterConfig = loadOnce<PluginUpdaterConfig>("@plugin-updater/config.js", () => import("@plugin-updater/config.js"));
export const loadPluginUpdaterCache = loadOnce<PluginUpdaterCache>("@plugin-updater/cache.js", () => import("@plugin-updater/cache.js"));
export const loadPluginUpdaterSyncbridge = loadOnce<PluginUpdaterSyncbridge>("@plugin-updater/syncbridge.js", () => import("@plugin-updater/syncbridge.js"));
export const loadPluginUpdaterEnv = loadOnce<PluginUpdaterEnv>("@plugin-updater/env.js", () => import("@plugin-updater/env.js"));
export const loadPluginUpdaterNpm = loadOnce<PluginUpdaterNpm>("@plugin-updater/npm.js", () => import("@plugin-updater/npm.js"));
export const loadPluginUpdaterIndex = loadOnce<PluginUpdaterIndex>("@plugin-updater/index.js", () => import("@plugin-updater/index.js"));
export const loadConfigLedger = loadOnce<ConfigLedgerLib>("@config-ledger/lib.js", () => import("@config-ledger/lib.js"));

export function resetOptionalEngineCacheForTests(): void {
  cache.clear();
}

// getPlugins (a home's plugins.json contents) is read by nearly every sidecar module; centralized
// here so an absent plugin-updater degrades once, consistently, to "no plugins" instead of each
// call site reimplementing the same fallback.
export async function safeGetPlugins(dir: string): Promise<Plugin[]> {
  const mod = await loadPluginUpdaterConfig();
  return mod ? mod.getPlugins(dir) : [];
}
