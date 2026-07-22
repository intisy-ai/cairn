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
import { setEarlyLaunchConfigDir } from "@plugin-updater/env.js";
import type { UpdateCache } from "@plugin-updater/cache.js";
import type { Plugin, NpmPlugin } from "@plugin-updater/types.js";
import type { HomePlugins, PluginHome, PluginHomeId, PluginRow, Result } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeDir } from "../lib/pluginHomes.js";
import { wrap } from "../result.js";

type UpdatePluginPublicFn = (name: string, url: string, branch?: string, commitHash?: string) => Promise<void | object>;
type SyncPluginsAcrossAppsFn = (configDir: string) => Promise<void>;
type DowngradeFn = (plugin: { name: string; url?: string; branch?: string }, commitHash: string) => string;

// Loaded dynamically (not statically bundled) because npm.js's require.resolve
// fallback trips a Rollup CommonJS-interop bug when inlined into this chunk.
async function getNpmPlugins(configDir: string): Promise<NpmPlugin[]> {
  const mod = await import("@plugin-updater/npm.js");
  return mod.getNpmPlugins(configDir);
}

// Sidecar RPCs run concurrently, but plugin-updater resolves its write target
// ambiently via getAppConfigDir(getAppName()). This chain serializes writes so
// each one sees only its own home's dir, then restores the Cairn scope.
let writeChain: Promise<unknown> = Promise.resolve();

function withHome<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(async () => {
    setEarlyLaunchConfigDir(dir);
    try {
      return await fn();
    } finally {
      setEarlyLaunchConfigDir(getConfigDir());
    }
  });
  writeChain = run.catch(() => undefined);
  return run;
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

export interface PluginsDeps {
  homes?: PluginHome[];
  updatePluginPublic?: UpdatePluginPublicFn;
  syncPluginsAcrossApps?: SyncPluginsAcrossAppsFn;
  downgrade?: DowngradeFn;
}

async function resolveHomes(deps: PluginsDeps): Promise<PluginHome[]> {
  return deps.homes ?? (await pluginHomes());
}

export function pluginsList(deps: PluginsDeps = {}): Promise<Result<HomePlugins[]>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const sections: HomePlugins[] = [];
    for (const home of homes) {
      if (!home.present) {
        sections.push({ home, rows: [] });
        continue;
      }
      const cache = readUpdateCache(home.dir);
      const gitRows = getPlugins(home.dir).map((p) => rowFor(p.name, "git", p.enabled !== false, p.url, cache));
      const npmRows = (await getNpmPlugins(home.dir)).map((p) => rowFor(p.name, "npm", true, undefined, cache));
      sections.push({ home, rows: [...gitRows, ...npmRows] });
    }
    return sections;
  });
}

export function pluginsInstall(homeId: PluginHomeId, name: string, url: string, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const dir = homeDir(homeId, homes);
    const updatePluginPublic = deps.updatePluginPublic ?? (await import("@plugin-updater/index.js")).updatePluginPublic;
    await withHome(dir, () => updatePluginPublic(name, url));
    if (homeId !== "cairn") {
      const syncPluginsAcrossApps = deps.syncPluginsAcrossApps ?? realSyncPluginsAcrossApps;
      await syncPluginsAcrossApps(dir);
    }
  });
}

export function pluginsSetEnabled(homeId: PluginHomeId, name: string, on: boolean, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const dir = homeDir(homeId, homes);
    const file = getPluginsPath(dir);
    const entries = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Plugin[]) : [];
    const entry = entries.find((e) => e.name === name);
    if (!entry) throw new Error(`plugin not found: ${name}`);
    entry.enabled = on;
    writeFileSync(file, JSON.stringify(entries, null, 2), "utf8");
  });
}

export function pluginsDowngrade(homeId: PluginHomeId, name: string, hash: string, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const dir = homeDir(homeId, homes);
    const plugin = getPlugins(dir).find((p) => p.name === name);
    if (!plugin) throw new Error(`plugin not found: ${name}`);
    const downgrade = deps.downgrade ?? (await import("@plugin-updater/index.js")).downgrade;
    const result = await withHome(dir, async () => downgrade({ name: plugin.name, url: plugin.url, branch: plugin.branch }, hash));
    if (result) throw new Error(result);
  });
}
