// plugin-updater's index.js self-activates (runs a real update sequence) on import
// unless this is set first. ESM hoists the static imports below above this line,
// but none of them transitively reach index.js, so the flag is still set before
// the lazy dynamic import() of index.js later in this module runs it.
process.env.PLUGIN_UPDATER_LIBRARY_MODE = "1";

import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import { join } from "node:path";
import { getConfigDir } from "@core-auth/index.js";
import { getConfigValue, isEngine } from "@core/index.js";
import { getPlugins, registerPlugin, setPluginEnabled, setPluginAutoUpdate } from "@plugin-updater/config.js";
import { readUpdateCache } from "@plugin-updater/cache.js";
import { svgIconDataUri } from "../lib/pluginIcon.js";
import { syncPluginsAcrossApps as realSyncPluginsAcrossApps } from "@plugin-updater/syncbridge.js";
import { setEarlyLaunchConfigDir } from "@plugin-updater/env.js";
import type { UpdateCache } from "@plugin-updater/cache.js";
import type { Plugin, NpmPlugin } from "@plugin-updater/types.js";
import type { HomePlugins, PluginHome, PluginHomeId, PluginRow, PluginVersion, Result, CliResult, InstallManyResult, InstallOutcome } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeDir, updaterInstalled } from "../lib/pluginHomes.js";
import { readNamespace, writeCacheMany } from "../lib/cache.js";
import { wrap } from "../result.js";

const VERSIONS_NS = "versions";

type UpdatePluginPublicFn = (name: string, url: string, branch?: string, commitHash?: string) => Promise<void | object>;
type SyncPluginsAcrossAppsFn = (configDir: string) => Promise<void>;
type DowngradeFn = (plugin: { name: string; url?: string; branch?: string }, commitHash: string) => string;
type HasUpdaterFn = (dir: string) => boolean;
type InitAppFn = (app: string) => Promise<Result<CliResult>>;

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

function readDescription(homeDirPath: string, name: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(homeDirPath, "repos", name, "package.json"), "utf-8"));
    return typeof pkg.description === "string" ? pkg.description : "";
  } catch {
    return "";
  }
}

// Read a plugin's cairn.json manifest from its deployed clone: displayName plus
// the referenced icon SVG base64-encoded into a data URI (safe for an <img>).
function readManifest(homeDirPath: string, name: string): { displayName?: string; icon?: string } {
  try {
    const repoDir = join(homeDirPath, "repos", name);
    const manifest = JSON.parse(readFileSync(join(repoDir, "cairn.json"), "utf-8"));
    const out: { displayName?: string; icon?: string } = {};
    if (typeof manifest.displayName === "string" && manifest.displayName) out.displayName = manifest.displayName;
    if (typeof manifest.icon === "string" && manifest.icon.endsWith(".svg")) {
      try {
        out.icon = svgIconDataUri(readFileSync(join(repoDir, manifest.icon), "utf-8"));
      } catch { /* icon file missing */ }
    }
    return out;
  } catch {
    return {};
  }
}

function rowFor(name: string, kind: "git" | "npm", enabled: boolean, url: string | undefined, cache: UpdateCache, homeDirPath: string): PluginRow {
  const entry = cache.plugins[name];
  const manifest = readManifest(homeDirPath, name);
  return {
    name,
    kind,
    enabled,
    url,
    installedVersion: entry?.installedVersion ?? null,
    updateAvailable: entry?.updateAvailable ?? false,
    description: readDescription(homeDirPath, name),
    displayName: manifest.displayName,
    icon: manifest.icon,
  };
}

export interface PluginsDeps {
  homes?: PluginHome[];
  updatePluginPublic?: UpdatePluginPublicFn;
  syncPluginsAcrossApps?: SyncPluginsAcrossAppsFn;
  downgrade?: DowngradeFn;
  npmPlugins?: (dir: string) => Promise<NpmPlugin[]>;
  uninstallPlugin?: (dir: string, name: string) => void;
  uninstallNpmPlugin?: (name: string, dir: string) => string;
  hasUpdater?: HasUpdaterFn;
  initApp?: InitAppFn;
  getPlugins?: (dir: string) => Plugin[];
  // Called at each phase boundary so a download row can show live progress;
  // percent is coarse phase-based progress 0..100.
  report?: (step: string, percent: number) => void;
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
      const gitRows = (deps.getPlugins ?? getPlugins)(home.dir).map((p) => rowFor(p.name, "git", p.enabled !== false, p.url, cache, home.dir));
      const npmRows = (await getNpmPlugins(home.dir)).map((p) => rowFor(p.name, "npm", true, undefined, cache, home.dir));
      sections.push({ home, rows: [...gitRows, ...npmRows] });
    }
    return sections;
  });
}

// Async so a git subprocess never blocks the single-threaded sidecar event loop;
// blocking here previously stalled every other request (readmes, the plugin list)
// while the whole plugin set was described.
async function realDescribe(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", dir, "describe", "--tags", "--always"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

// A full clone carries every release tag, so `git describe` yields the last tag
// plus how far ahead HEAD is: "v1.2.3" on a tag, "v1.2.3 +5" five commits later,
// and a bare short SHA when the repo has no tags at all.
export function formatGitVersion(describe: string | null): string | null {
  if (!describe) return null;
  const ahead = describe.match(/^(.*)-(\d+)-g[0-9a-f]+$/);
  return ahead ? `${ahead[1]} +${ahead[2]}` : describe;
}

export interface PluginVersionsDeps {
  homes?: PluginHome[];
  readCache?: (dir: string) => UpdateCache;
  describe?: (dir: string) => string | null | Promise<string | null>;
  exists?: (path: string) => boolean;
  getPlugins?: (dir: string) => Plugin[];
  npmPlugins?: (dir: string) => Promise<NpmPlugin[]>;
  // Where the persistent version cache lives; "" disables it (used in tests).
  cacheDir?: string;
}

// The last-known versions from the persistent cache, so the Plugins list shows
// versions instantly on load while pluginVersionsAll() recomputes in the
// background. Returns an empty map on a cold cache.
export function pluginVersionsCached(deps: PluginVersionsDeps = {}): Promise<Result<Record<string, Record<string, PluginVersion>>>> {
  return wrap(async () => {
    const ns = readNamespace<Record<string, PluginVersion>>(VERSIONS_NS, deps.cacheDir ?? getConfigDir());
    const out: Record<string, Record<string, PluginVersion>> = {};
    for (const [name, entry] of Object.entries(ns)) out[name] = entry.value;
    return out;
  });
}

async function gitVersionFor(repoDir: string, entry: UpdateCache["plugins"][string] | undefined, describe: (dir: string) => string | null | Promise<string | null>, autoUpdate: boolean): Promise<PluginVersion> {
  const label = formatGitVersion(await describe(repoDir)) ?? (entry?.localHead ? entry.localHead.slice(0, 7) : null);
  return { kind: "git", label, updateAvailable: entry?.updateAvailable ?? false, autoUpdate };
}

// A plugin can be registered in a home's plugins.json but not yet cloned there
// (plugin-updater materializes it on that app's next launch). Its version there is
// genuinely unknown until it is cloned, so report it as such (label null) rather
// than borrowing another home's version and implying a certainty we don't have.
function markUnknown(perHome: Record<string, PluginVersion>, homes: { id: string; autoUpdate: boolean }[]): void {
  for (const h of homes) perHome[h.id] = { kind: "git", label: null, updateAvailable: false, autoUpdate: h.autoUpdate };
}

export function pluginVersions(name: string, deps: PluginVersionsDeps = {}): Promise<Result<Record<string, PluginVersion>>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const readCache = deps.readCache ?? readUpdateCache;
    const describe = deps.describe ?? realDescribe;
    const exists = deps.exists ?? existsSync;
    const listGit = deps.getPlugins ?? getPlugins;
    const out: Record<string, PluginVersion> = {};
    const registeredWithoutClone: { id: string; autoUpdate: boolean }[] = [];
    for (const home of homes) {
      if (!home.present) continue;
      const entry = readCache(home.dir).plugins[name];
      const gitEntry = listGit(home.dir).find((p) => p.name === name);
      const autoUpdate = gitEntry ? gitEntry.autoUpdate !== false : true;
      const repoDir = join(home.dir, "repos", name);
      if (exists(repoDir)) {
        out[home.id] = await gitVersionFor(repoDir, entry, describe, autoUpdate);
      } else if (entry?.kind === "npm") {
        out[home.id] = { kind: "npm", label: entry.installedVersion, updateAvailable: entry.updateAvailable, autoUpdate: true };
      } else if (gitEntry) {
        registeredWithoutClone.push({ id: home.id, autoUpdate });
      }
    }
    markUnknown(out, registeredWithoutClone);
    return out;
  });
}

// One pass over every home computes the version of each installed plugin, so the
// Plugins list can show versions without a per-row round-trip.
export function pluginVersionsAll(deps: PluginVersionsDeps = {}): Promise<Result<Record<string, Record<string, PluginVersion>>>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const readCache = deps.readCache ?? readUpdateCache;
    const describe = deps.describe ?? realDescribe;
    const exists = deps.exists ?? existsSync;
    const listGit = deps.getPlugins ?? getPlugins;
    const listNpm = deps.npmPlugins ?? getNpmPlugins;
    const out: Record<string, Record<string, PluginVersion>> = {};
    const missing: Array<{ name: string; homeId: string; autoUpdate: boolean }> = [];
    for (const home of homes) {
      if (!home.present) continue;
      const cache = readCache(home.dir);
      // Describe every cloned git plugin in this home in parallel so the whole
      // home is one batch of concurrent git subprocesses, not a serial chain.
      const gitEntries = listGit(home.dir);
      const described = await Promise.all(
        gitEntries.map(async (p) => {
          const repoDir = join(home.dir, "repos", p.name);
          if (!exists(repoDir)) return { p, version: null };
          return { p, version: await gitVersionFor(repoDir, cache.plugins[p.name], describe, p.autoUpdate !== false) };
        }),
      );
      for (const { p, version } of described) {
        out[p.name] ??= {};
        if (version) out[p.name][home.id] = version;
        else missing.push({ name: p.name, homeId: home.id, autoUpdate: p.autoUpdate !== false });
      }
      for (const p of await listNpm(home.dir)) {
        const entry = cache.plugins[p.name];
        (out[p.name] ??= {})[home.id] = { kind: "npm", label: entry?.installedVersion ?? null, updateAvailable: entry?.updateAvailable ?? false, autoUpdate: true };
      }
    }
    for (const { name, homeId, autoUpdate } of missing) {
      if (!out[name][homeId]) markUnknown(out[name], [{ id: homeId, autoUpdate }]);
    }
    // Persist all plugins' versions in a single cache write so the next load
    // renders instantly and only rows that actually changed update.
    writeCacheMany(VERSIONS_NS, out, deps.cacheDir ?? getConfigDir());
    return out;
  });
}

export function pluginsInstall(homeId: PluginHomeId, name: string, url: string, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const dir = homeDir(homeId, homes);

    const report = deps.report;
    const hasUpdater = deps.hasUpdater ?? updaterInstalled;
    if (!hasUpdater(dir)) {
      // Every home (Cairn included) needs plugin-updater before it takes a
      // non-engine; an engine may install to bootstrap it. An app home gets the
      // updater set up via its CLI; Cairn clones directly with its bundled copy.
      if (!isEngine(name)) throw new Error("install plugin-updater in this app before adding plugins");
      if (homeId !== "cairn") {
        report?.("Setting up plugin-updater", 10);
        const initApp = deps.initApp ?? (await import("./apps.js")).appsInit;
        const result = await initApp(homeId);
        if (!result.ok) throw new Error(result.error);
      }
    }

    const updatePluginPublic = deps.updatePluginPublic ?? (await import("@plugin-updater/index.js")).updatePluginPublic;
    let autoUpdateDefault = true;
    const val = getConfigValue("cairn", "autoUpdateDefault");
    if (typeof val === "boolean") autoUpdateDefault = val;
    report?.("Downloading and building", 40);
    await withHome(dir, async () => {
      await updatePluginPublic(name, url);
      report?.("Registering", 90);
      registerPlugin(dir, name, url, autoUpdateDefault);
    });
    if (homeId !== "cairn") {
      report?.("Syncing to other apps", 95);
      const syncPluginsAcrossApps = deps.syncPluginsAcrossApps ?? realSyncPluginsAcrossApps;
      await syncPluginsAcrossApps(dir);
    }
  });
}

export function pluginsInstallMany(name: string, url: string, homeIds: string[], deps: PluginsDeps = {}): Promise<Result<InstallManyResult>> {
  return wrap(async () => {
    const outcomes: InstallOutcome[] = [];
    for (let i = 0; i < homeIds.length; i++) {
      const homeId = homeIds[i];
      const base = deps.report;
      // Spread each home's 0..100 across its slice of the overall bar so the
      // percentage advances smoothly through a multi-home install.
      const report = base
        ? (step: string, percent: number) => {
            const overall = Math.round(((i + Math.max(percent, 0) / 100) / homeIds.length) * 100);
            base(homeIds.length > 1 ? `${homeId} (${i + 1}/${homeIds.length}): ${step}` : step, overall);
          }
        : undefined;
      const res = await pluginsInstall(homeId, name, url, { ...deps, report });
      outcomes.push(res.ok ? { home: homeId, ok: true } : { home: homeId, ok: false, error: res.error });
    }
    return { outcomes };
  });
}

export function pluginsRemoveEverywhere(name: string, deps: PluginsDeps = {}): Promise<Result<InstallManyResult>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const outcomes: InstallOutcome[] = [];
    for (const home of homes) {
      const installed = (deps.getPlugins ?? getPlugins)(home.dir).some((p) => p.name === name);
      if (!installed) continue;
      const res = await pluginsUninstall(home.id, name, deps);
      outcomes.push(res.ok ? { home: home.id, ok: true } : { home: home.id, ok: false, error: res.error });
    }
    return { outcomes };
  });
}

export function pluginsSetEnabled(homeId: PluginHomeId, name: string, on: boolean, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const dir = homeDir(homeId, await resolveHomes(deps));
    if (!setPluginEnabled(dir, name, on)) throw new Error(`plugin not found: ${name}`);
  });
}

export function pluginsSetAutoUpdate(homeId: PluginHomeId, name: string, on: boolean, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const dir = homeDir(homeId, await resolveHomes(deps));
    if (!setPluginAutoUpdate(dir, name, on)) throw new Error(`plugin not found: ${name}`);
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

export function pluginsUninstall(homeId: string, name: string, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const dir = homeDir(homeId as PluginHomeId, homes);
    if (getPlugins(dir).some((p) => p.name === name)) {
      const uninstall = deps.uninstallPlugin ?? (await import("@plugin-updater/index.js")).uninstallPlugin;
      await withHome(dir, async () => uninstall(dir, name));
      return;
    }
    const npmList = deps.npmPlugins ?? getNpmPlugins;
    if ((await npmList(dir)).some((p) => p.name === name)) {
      const uninstallNpm = deps.uninstallNpmPlugin ?? (await import("@plugin-updater/npm.js")).uninstallNpmPlugin;
      const message = await withHome(dir, async () => uninstallNpm(name, dir));
      if (message) throw new Error(message);
      return;
    }
    throw new Error(`plugin not found: ${name}`);
  });
}
