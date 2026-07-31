// plugin-updater's index.js self-activates (runs a real update sequence) on import
// unless this is set first. ESM hoists the static imports below above this line,
// but none of them transitively reach index.js, so the flag is still set before
// the lazy dynamic import() of index.js later in this module runs it.
process.env.PLUGIN_UPDATER_LIBRARY_MODE = "1";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { getConfigDir } from "@core-auth/index.js";
import { getConfigValue, isMandatoryEngine } from "@core/index.js";
import { getPlugins, getPluginsPath } from "@plugin-updater/config.js";
import { readUpdateCache } from "@plugin-updater/cache.js";
import { svgIconDataUri } from "../lib/pluginIcon.js";
import { syncPluginsAcrossApps as realSyncPluginsAcrossApps } from "@plugin-updater/syncbridge.js";
import { setEarlyLaunchConfigDir } from "@plugin-updater/env.js";
import type { UpdateCache } from "@plugin-updater/cache.js";
import type { Plugin, NpmPlugin } from "@plugin-updater/types.js";
import type { HomePlugins, PluginHome, PluginHomeId, PluginRow, PluginVersion, Result, CliResult, InstallManyResult, InstallOutcome } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeDir } from "../lib/pluginHomes.js";
import { wrap } from "../result.js";

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

function realDescribe(dir: string): string | null {
  try {
    const out = execFileSync("git", ["-C", dir, "describe", "--tags", "--always"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() || null;
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
  describe?: (dir: string) => string | null;
  exists?: (path: string) => boolean;
}

export function pluginVersions(name: string, deps: PluginVersionsDeps = {}): Promise<Result<Record<string, PluginVersion>>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const readCache = deps.readCache ?? readUpdateCache;
    const describe = deps.describe ?? realDescribe;
    const exists = deps.exists ?? existsSync;
    const out: Record<string, PluginVersion> = {};
    for (const home of homes) {
      if (!home.present) continue;
      const entry = readCache(home.dir).plugins[name];
      const repoDir = join(home.dir, "repos", name);
      if (exists(repoDir)) {
        const described = formatGitVersion(describe(repoDir));
        const fallbackSha = entry?.localHead ? entry.localHead.slice(0, 7) : null;
        out[home.id] = { kind: "git", label: described ?? fallbackSha, updateAvailable: entry?.updateAvailable ?? false };
      } else if (entry?.kind === "npm") {
        out[home.id] = { kind: "npm", label: entry.installedVersion, updateAvailable: entry.updateAvailable };
      }
    }
    return out;
  });
}

// plugin-updater only clones+builds the repo; registering it in plugins.json
// (so getPlugins/pluginsList and proxy discovery pick it up) is the caller's job.
function registerPlugin(dir: string, name: string, url: string, autoUpdateDefault: boolean = true): void {
  const file = getPluginsPath(dir);
  const entries = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Plugin[]) : [];
  const entry = entries.find((e) => e.name === name);
  if (entry) {
    entry.url = url;
  } else {
    entries.push({ name, url, enabled: true, autoUpdate: autoUpdateDefault });
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(entries, null, 2), "utf8");
}

export function pluginsInstall(homeId: PluginHomeId, name: string, url: string, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const dir = homeDir(homeId, homes);

    if (homeId !== "cairn") {
      const hasUpdater = deps.hasUpdater ?? ((d: string) => existsSync(getPluginsPath(d)));
      if (!hasUpdater(dir)) {
        const initApp = deps.initApp ?? (await import("./apps.js")).appsInit;
        const result = await initApp(homeId);
        if (!result.ok) throw new Error(result.error);
      }
    }

    const updatePluginPublic = deps.updatePluginPublic ?? (await import("@plugin-updater/index.js")).updatePluginPublic;
    let autoUpdateDefault = true;
    const val = getConfigValue("cairn", "autoUpdateDefault");
    if (typeof val === "boolean") autoUpdateDefault = val;
    await withHome(dir, async () => {
      await updatePluginPublic(name, url);
      registerPlugin(dir, name, url, autoUpdateDefault);
    });
    if (homeId !== "cairn") {
      const syncPluginsAcrossApps = deps.syncPluginsAcrossApps ?? realSyncPluginsAcrossApps;
      await syncPluginsAcrossApps(dir);
    }
  });
}

export function pluginsInstallMany(name: string, url: string, homeIds: string[], deps: PluginsDeps = {}): Promise<Result<InstallManyResult>> {
  return wrap(async () => {
    const outcomes: InstallOutcome[] = [];
    for (const homeId of homeIds) {
      const res = await pluginsInstall(homeId, name, url, deps);
      outcomes.push(res.ok ? { home: homeId, ok: true } : { home: homeId, ok: false, error: res.error });
    }
    return { outcomes };
  });
}

export function pluginsRemoveEverywhere(name: string, deps: PluginsDeps = {}): Promise<Result<InstallManyResult>> {
  return wrap(async () => {
    if (isMandatoryEngine(name)) throw new Error("refusing to remove the plugin engine");
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
    if (isMandatoryEngine(name) && !on) throw new Error("cannot disable the plugin engine");
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

export function pluginsUninstall(homeId: string, name: string, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    if (isMandatoryEngine(name)) throw new Error("refusing to uninstall the plugin engine");
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
