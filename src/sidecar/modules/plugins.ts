// plugin-updater's index.js self-activates (runs a real update sequence) on import
// unless this is set first. ESM hoists the static imports below above this line,
// but none of them transitively reach index.js, so the flag is still set before
// the lazy dynamic import() of index.js later in this module runs it.
process.env.PLUGIN_UPDATER_LIBRARY_MODE = "1";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getConfigDir } from "@core-auth/index.js";
import { getPlugins, getPluginsPath } from "@plugin-updater/config.js";
import { readUpdateCache } from "@plugin-updater/cache.js";
import { syncPluginsAcrossApps as realSyncPluginsAcrossApps } from "@plugin-updater/syncbridge.js";
import type { UpdateCache } from "@plugin-updater/cache.js";
import type { Plugin } from "@plugin-updater/types.js";
import type { PluginRow, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

type UpdatePluginPublicFn = (name: string, url: string, branch?: string, commitHash?: string) => Promise<void | object>;
type SyncPluginsAcrossAppsFn = (configDir: string) => Promise<void>;
type DowngradeFn = (plugin: { name: string; url?: string; branch?: string }, commitHash: string) => string;
type GetNpmPluginsFn = (configDir: string) => Array<{ name: string; version: string; installed: boolean; raw: string }>;

// Loaded dynamically (not statically bundled) because npm.js's require.resolve
// fallback trips a Rollup CommonJS-interop bug when inlined into this chunk.
async function getNpmPlugins(configDir: string): Promise<ReturnType<GetNpmPluginsFn>> {
  const mod = await import("@plugin-updater/npm.js");
  return mod.getNpmPlugins(configDir);
}

function rowFor(name: string, kind: "git" | "npm", enabled: boolean, url: string | undefined, cache: UpdateCache): PluginRow {
  const entry = cache.plugins[name];
  return {
    name,
    kind,
    enabled,
    url,
    installedVersion: entry?.installedVersion ?? null,
    updateAvailable: entry?.updateAvailable ?? false,
  };
}

export function pluginsList(): Promise<Result<PluginRow[]>> {
  return wrap(async () => {
    const configDir = getConfigDir();
    const cache = readUpdateCache(configDir);
    const gitRows = getPlugins(configDir).map((p) => rowFor(p.name, "git", p.enabled !== false, p.url, cache));
    const npmPlugins = await getNpmPlugins(configDir);
    const npmRows = npmPlugins.map((p) => rowFor(p.name, "npm", true, undefined, cache));
    return [...gitRows, ...npmRows];
  });
}

export function pluginsSetEnabled(name: string, on: boolean): Promise<Result<void>> {
  return wrap(() => {
    const configDir = getConfigDir();
    const file = getPluginsPath(configDir);
    const entries = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Plugin[]) : [];
    const entry = entries.find((e) => e.name === name);
    if (!entry) throw new Error(`plugin not found: ${name}`);
    entry.enabled = on;
    writeFileSync(file, JSON.stringify(entries, null, 2), "utf8");
  });
}

export interface PluginsInstallDeps {
  updatePluginPublic?: UpdatePluginPublicFn;
  syncPluginsAcrossApps?: SyncPluginsAcrossAppsFn;
}

export function pluginsInstall(name: string, url: string, deps: PluginsInstallDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const updatePluginPublic = deps.updatePluginPublic ?? (await import("@plugin-updater/index.js")).updatePluginPublic;
    const syncPluginsAcrossApps = deps.syncPluginsAcrossApps ?? realSyncPluginsAcrossApps;
    await updatePluginPublic(name, url);
    await syncPluginsAcrossApps(getConfigDir());
  });
}

export interface PluginsDowngradeDeps {
  downgrade?: DowngradeFn;
  getPlugins?: typeof getPlugins;
}

export function pluginsDowngrade(name: string, hash: string, deps: PluginsDowngradeDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const configDir = getConfigDir();
    const listPlugins = deps.getPlugins ?? getPlugins;
    const plugin = listPlugins(configDir).find((p) => p.name === name);
    if (!plugin) throw new Error(`plugin not found: ${name}`);
    const downgrade = deps.downgrade ?? (await import("@plugin-updater/index.js")).downgrade;
    const result = downgrade({ name: plugin.name, url: plugin.url, branch: plugin.branch }, hash);
    if (result) throw new Error(result);
  });
}
