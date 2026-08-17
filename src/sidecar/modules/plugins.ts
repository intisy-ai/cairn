import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import { join } from "node:path";
import { getConfigDir } from "@core-auth/index.js";
import { getConfigValue, activityEnv } from "@core/index.js";
import { readPluginManifest } from "../lib/pluginManifest.js";
import { pluginIdFromClone } from "../lib/capabilityOwner.js";
import { emitCairnAction } from "../activity.js";
import type { UpdateCache } from "@intisy-ai/plugin-updater/dist/cache.js";
import type { Plugin, NpmPlugin } from "@intisy-ai/plugin-updater/dist/types.js";
import type { HomePlugins, PluginHome, PluginHomeId, PluginRow, PluginVersion, UpdateState, Result, InstallManyResult, InstallOutcome } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeDir, homeById, updaterInstalled } from "../lib/pluginHomes.js";
import { readNamespace, writeCacheMany } from "../lib/cache.js";
import {
  safeGetPlugins,
  safeMissingArtifacts,
  loadPluginUpdaterConfig,
  loadPluginUpdaterCache,
  loadPluginUpdaterSyncbridge,
  loadPluginUpdaterEnv,
  loadPluginUpdaterNpm,
  loadPluginUpdaterIndex,
  loadPluginUpdaterInit,
} from "../lib/optionalEngines.js";
import { repoProvidingCapability } from "../lib/capabilityCatalog.js";
import { pluginOwningCapability } from "./engines.js";
import { pruneUnusedLibraries } from "./libraryPrune.js";
import { wrap } from "../result.js";
import { reposDir } from "../lib/storagePaths.js";

const VERSIONS_NS = "versions";
const PLUGINS_NS = "plugins";
const PLUGIN_MANAGEMENT = "plugin-management";

// The catalog answers first (what a home's marketplace sources DECLARE), which is what
// recognizes the manager during its own from-scratch bootstrap, before anything is
// deployed anywhere. The deployed-manifest lookup is the fallback: it is what still
// recognizes an already-deployed manager when the catalog cannot be reached. A catalog
// failure degrades to that fallback, and then to false; it never aborts the check.
async function isPluginManager(name: string, homeDir: string): Promise<boolean> {
  let catalogId: string | null = null;
  try {
    catalogId = (await repoProvidingCapability(homeDir, PLUGIN_MANAGEMENT))?.id ?? null;
  } catch {
    catalogId = null;
  }
  return catalogId === name || pluginOwningCapability(PLUGIN_MANAGEMENT, homeDir) === name;
}

type PluginChannel = "inherit" | "stable" | "experimental";
type UpdatePluginPublicFn = (name: string, url: string, branch?: string, commitHash?: string) => Promise<void | object>;
type SyncPluginsAcrossAppsFn = (configDir: string) => Promise<void>;
type DowngradeFn = (plugin: { name: string; url?: string; branch?: string }, commitHash: string) => string;
type HasUpdaterFn = (dir: string) => boolean | Promise<boolean>;
type RegisterWithAppFn = (dir: string, app: string) => void | Promise<void>;

const EMPTY_UPDATE_CACHE: UpdateCache = { checkedAt: new Date(0).toISOString(), plugins: {} };

// Every plugin-updater call below is a soft reference: with the sibling repo absent from
// this build, reads degrade to empty results and writes fail with a clear, catchable error
// (via wrap()) instead of an unhandled module-resolution crash.
export function requirePluginUpdater<T>(mod: T | null): T {
  if (!mod) throw new Error("plugin-updater is not available in this build");
  return mod;
}

async function realRegisterPlugin(dir: string, name: string, url: string, autoUpdate?: boolean): Promise<void> {
  requirePluginUpdater(await loadPluginUpdaterConfig()).registerPlugin(dir, name, url, autoUpdate);
}

// null means the engine itself is unavailable, distinct from boolean false (engine present,
// plugin not found) so callers can report the real cause instead of a misleading "not found".
async function realSetPluginEnabled(dir: string, name: string, on: boolean): Promise<boolean | null> {
  const mod = await loadPluginUpdaterConfig();
  return mod ? mod.setPluginEnabled(dir, name, on) : null;
}

async function realSetPluginAutoUpdate(dir: string, name: string, on: boolean): Promise<boolean | null> {
  const mod = await loadPluginUpdaterConfig();
  return mod ? mod.setPluginAutoUpdate(dir, name, on) : null;
}

async function realSetPluginChannel(dir: string, name: string, channel: PluginChannel): Promise<boolean | null> {
  const mod = await loadPluginUpdaterConfig();
  return mod ? mod.setPluginChannel(dir, name, channel) : null;
}

async function realReadUpdateCache(dir: string): Promise<UpdateCache> {
  const mod = await loadPluginUpdaterCache();
  return mod ? mod.readUpdateCache(dir) : EMPTY_UPDATE_CACHE;
}

// The single question both the dashboard and the loader TUI ask; without the engine there is
// no channel to report, so a missing plugin-updater reads the same as "never opted in".
async function realChannelState(dir: string, name: string): Promise<{ onExperimental: boolean; experimentalAvailable: boolean | null }> {
  const mod = await loadPluginUpdaterIndex();
  return mod ? mod.pluginChannelState(dir, name) : { onExperimental: false, experimentalAvailable: null };
}

async function realSyncPluginsAcrossApps(dir: string): Promise<void> {
  const mod = await loadPluginUpdaterSyncbridge();
  if (mod) await mod.syncPluginsAcrossApps(dir);
}

async function realSetEarlyLaunchConfigDir(dir: string): Promise<void> {
  (await loadPluginUpdaterEnv())?.setEarlyLaunchConfigDir(dir);
}

async function realRegisterWithApp(dir: string, app: string): Promise<void> {
  requirePluginUpdater(await loadPluginUpdaterInit()).registerUpdaterWithApp(dir, app);
}

// Loaded dynamically (not statically bundled) because npm.js's require.resolve
// fallback trips a Rollup CommonJS-interop bug when inlined into this chunk.
async function getNpmPlugins(configDir: string): Promise<NpmPlugin[]> {
  const mod = await loadPluginUpdaterNpm();
  return mod ? mod.getNpmPlugins(configDir) : [];
}

// Sidecar RPCs run concurrently, but plugin-updater resolves its write target
// ambiently via getAppConfigDir(getAppName()). This chain serializes writes so
// each one sees only its own home's dir, then restores the Cairn scope.
let writeChain: Promise<unknown> = Promise.resolve();

// plugin-updater bundles its own core, so it has its own async-context store and cannot
// see the cause scope this dispatch is running in. The environment is the one channel
// both bundles share: exporting the cause and the app id here lets its records say who
// asked and which app they belong to instead of "unknown" and "no app". Safe to touch
// process-wide because writeChain serializes these calls.
const ACTIVITY_ENV_KEYS = ["HUB_ACTIVITY_TRACE", "HUB_ACTIVITY_CAUSE", "HUB_ACTIVITY_PARENT", "CORE_APP"];

export function withHome<T>(dir: string, fn: () => Promise<T>, appId?: string): Promise<T> {
  const run = writeChain.then(async () => {
    const saved: Record<string, string | undefined> = {};
    for (const key of ACTIVITY_ENV_KEYS) saved[key] = process.env[key];
    await realSetEarlyLaunchConfigDir(dir);
    try {
      Object.assign(process.env, activityEnv());
      if (appId) process.env.CORE_APP = appId;
    } catch { /* attribution is never worth failing the operation */ }
    try {
      return await fn();
    } finally {
      for (const key of ACTIVITY_ENV_KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
      await realSetEarlyLaunchConfigDir(getConfigDir());
    }
  });
  writeChain = run.catch(() => undefined);
  return run;
}

function readDescription(homeDirPath: string, name: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(reposDir(homeDirPath), name, "package.json"), "utf-8"));
    return typeof pkg.description === "string" ? pkg.description : "";
  } catch {
    return "";
  }
}

function rowFor(name: string, kind: "git" | "npm", enabled: boolean, url: string | undefined, cache: UpdateCache, homeDirPath: string): PluginRow {
  const entry = cache.plugins[name];
  const manifest = readPluginManifest(name, homeDirPath);
  return {
    name,
    // Only a git clone has its own plugin.json to declare one; an npm plugin has no clone.
    pluginId: kind === "git" ? pluginIdFromClone(name, homeDirPath) : undefined,
    kind,
    // An npm plugin is present by virtue of being listed; a git one needs its clone. A config
    // entry with nothing behind it is an install the manager has not carried out yet.
    present: kind === "npm" || existsSync(join(reposDir(homeDirPath), name)),
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
  cacheDir?: string;
  missingArtifacts?: (dir: string, name: string) => Promise<string[]>;
  updatePluginPublic?: UpdatePluginPublicFn;
  syncPluginsAcrossApps?: SyncPluginsAcrossAppsFn;
  downgrade?: DowngradeFn;
  npmPlugins?: (dir: string) => Promise<NpmPlugin[]>;
  uninstallPlugin?: (dir: string, name: string) => void;
  uninstallNpmPlugin?: (name: string, dir: string) => string;
  hasUpdater?: HasUpdaterFn;
  registerWithApp?: RegisterWithAppFn;
  ensureUpdater?: (homeId: string) => Promise<Result<void>>;
  setPluginChannel?: (dir: string, name: string, channel: PluginChannel) => boolean | null | Promise<boolean | null>;
  getPlugins?: (dir: string) => Plugin[] | Promise<Plugin[]>;
  // Called at each phase boundary so a download row can show live progress;
  // percent is coarse phase-based progress 0..100.
  report?: (step: string, percent: number) => void;
  prune?: (dir: string) => Promise<string[]>;
}

async function resolveHomes(deps: PluginsDeps): Promise<PluginHome[]> {
  return deps.homes ?? (await pluginHomes());
}

export function pluginsList(deps: PluginsDeps = {}): Promise<Result<HomePlugins[]>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const listGit = deps.getPlugins ?? safeGetPlugins;
    const missingArtifacts = deps.missingArtifacts ?? safeMissingArtifacts;
    // Homes are independent, so they are read concurrently rather than one after
    // another: the list is what the user waits on before any plugin screen paints.
    const sections = await Promise.all(homes.map(async (home): Promise<HomePlugins> => {
      if (!home.present) return { home, rows: [] };
      const cache = await realReadUpdateCache(home.dir);
      const gitRows = await Promise.all((await listGit(home.dir)).map(async (p) => ({
        ...rowFor(p.name, "git", p.enabled !== false, p.url, cache, home.dir),
        // Only a git clone has a build to be incomplete; an npm install either resolved or did not.
        missingArtifacts: await missingArtifacts(home.dir, p.name),
      })));
      const npmRows = (await getNpmPlugins(home.dir)).map((p) => rowFor(p.name, "npm", true, undefined, cache, home.dir));
      return { home, rows: [...gitRows, ...npmRows] };
    }));
    writeCacheMany(PLUGINS_NS, Object.fromEntries(sections.map((s) => [s.home.id, s])), deps.cacheDir ?? getConfigDir());
    return sections;
  });
}

// The last list this home produced, returned without touching disk beyond the cache file.
// The screen paints from this first so it is never blank while the real read runs, which is
// what the wait before any plugin screen appeared actually was.
export function pluginsListCached(deps: PluginsDeps = {}): Promise<Result<HomePlugins[]>> {
  return wrap(async () => {
    const ns = readNamespace<HomePlugins>(PLUGINS_NS, deps.cacheDir ?? getConfigDir());
    return Object.values(ns).map((entry) => entry.value);
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
  readCache?: (dir: string) => UpdateCache | Promise<UpdateCache>;
  describe?: (dir: string) => string | null | Promise<string | null>;
  exists?: (path: string) => boolean;
  getPlugins?: (dir: string) => Plugin[] | Promise<Plugin[]>;
  npmPlugins?: (dir: string) => Promise<NpmPlugin[]>;
  channelState?: (dir: string, name: string) => { onExperimental: boolean; experimentalAvailable: boolean | null } | Promise<{ onExperimental: boolean; experimentalAvailable: boolean | null }>;
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

// An entry with no local head was never successfully read, so its remote comparison says
// nothing: report that rather than letting a missing side pass for "up to date".
export function gitUpdateState(entry: UpdateCache["plugins"][string] | undefined): UpdateState {
  if (!entry) return "unknown";
  if (entry.updateAvailable) return "behind";
  return entry.localHead ? "current" : "unknown";
}

async function gitVersionFor(
  repoDir: string,
  entry: UpdateCache["plugins"][string] | undefined,
  describe: (dir: string) => string | null | Promise<string | null>,
  autoUpdate: boolean,
  checkedAt: string | null,
  channel: { onExperimental: boolean; experimentalAvailable: boolean | null },
): Promise<PluginVersion> {
  const label = formatGitVersion(await describe(repoDir)) ?? (entry?.localHead ? entry.localHead.slice(0, 7) : null);
  return {
    kind: "git",
    label,
    updateState: gitUpdateState(entry),
    autoUpdate,
    checkedAt,
    onExperimental: channel.onExperimental,
    experimentalAvailable: channel.experimentalAvailable,
  };
}

// A registered-but-uncloned plugin has no real version (label null), but its channel answer needs no clone, so it is still asked for here.
async function markUnknown(
  perHome: Record<string, PluginVersion>,
  name: string,
  homes: { id: string; dir: string; autoUpdate: boolean }[],
  channelState: (dir: string, name: string) => { onExperimental: boolean; experimentalAvailable: boolean | null } | Promise<{ onExperimental: boolean; experimentalAvailable: boolean | null }>,
): Promise<void> {
  for (const h of homes) {
    const channel = await channelState(h.dir, name);
    perHome[h.id] = { kind: "git", label: null, updateState: "unknown", autoUpdate: h.autoUpdate, onExperimental: channel.onExperimental, experimentalAvailable: channel.experimentalAvailable };
  }
}

export function pluginVersions(name: string, deps: PluginVersionsDeps = {}): Promise<Result<Record<string, PluginVersion>>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const readCache = deps.readCache ?? realReadUpdateCache;
    const describe = deps.describe ?? realDescribe;
    const exists = deps.exists ?? existsSync;
    const listGit = deps.getPlugins ?? safeGetPlugins;
    const out: Record<string, PluginVersion> = {};
    const registeredWithoutClone: { id: string; dir: string; autoUpdate: boolean }[] = [];
    const channelState = deps.channelState ?? realChannelState;
    for (const home of homes) {
      if (!home.present) continue;
      const cache = await readCache(home.dir);
      const entry = cache.plugins[name];
      const gitEntry = (await listGit(home.dir)).find((p) => p.name === name);
      const autoUpdate = gitEntry ? gitEntry.autoUpdate !== false : true;
      const repoDir = join(reposDir(home.dir), name);
      if (exists(repoDir)) {
        const channel = await channelState(home.dir, name);
        out[home.id] = await gitVersionFor(repoDir, entry, describe, autoUpdate, cache.checkedAt ?? null, channel);
      } else if (entry?.kind === "npm") {
        out[home.id] = { kind: "npm", label: entry.installedVersion, updateState: entry.updateAvailable ? "behind" : "current", autoUpdate: true, onExperimental: false, experimentalAvailable: null };
      } else if (gitEntry) {
        registeredWithoutClone.push({ id: home.id, dir: home.dir, autoUpdate });
      }
    }
    await markUnknown(out, name, registeredWithoutClone, channelState);
    return out;
  });
}

// One pass over every home computes the version of each installed plugin, so the
// Plugins list can show versions without a per-row round-trip.
export function pluginVersionsAll(deps: PluginVersionsDeps = {}): Promise<Result<Record<string, Record<string, PluginVersion>>>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const readCache = deps.readCache ?? realReadUpdateCache;
    const describe = deps.describe ?? realDescribe;
    const exists = deps.exists ?? existsSync;
    const listGit = deps.getPlugins ?? safeGetPlugins;
    const listNpm = deps.npmPlugins ?? getNpmPlugins;
    const out: Record<string, Record<string, PluginVersion>> = {};
    const missing: Array<{ name: string; homeId: string; dir: string; autoUpdate: boolean }> = [];
    const channelState = deps.channelState ?? realChannelState;
    for (const home of homes) {
      if (!home.present) continue;
      const cache = await readCache(home.dir);
      // Describe every cloned git plugin in this home in parallel so the whole
      // home is one batch of concurrent git subprocesses, not a serial chain.
      const gitEntries = await listGit(home.dir);
      const described = await Promise.all(
        gitEntries.map(async (p) => {
          const repoDir = join(reposDir(home.dir), p.name);
          if (!exists(repoDir)) return { p, version: null };
          const channel = await channelState(home.dir, p.name);
          return { p, version: await gitVersionFor(repoDir, cache.plugins[p.name], describe, p.autoUpdate !== false, cache.checkedAt ?? null, channel) };
        }),
      );
      for (const { p, version } of described) {
        out[p.name] ??= {};
        if (version) out[p.name][home.id] = version;
        else missing.push({ name: p.name, homeId: home.id, dir: home.dir, autoUpdate: p.autoUpdate !== false });
      }
      for (const p of await listNpm(home.dir)) {
        const entry = cache.plugins[p.name];
        (out[p.name] ??= {})[home.id] = { kind: "npm", label: entry?.installedVersion ?? null, updateState: entry?.updateAvailable ? "behind" : "current", autoUpdate: true, onExperimental: false, experimentalAvailable: null };
      }
    }
    for (const { name, homeId, dir, autoUpdate } of missing) {
      if (!out[name][homeId]) await markUnknown(out[name], name, [{ id: homeId, dir, autoUpdate }], channelState);
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

    // First event in this dispatch's cause scope, so it becomes the trace root every
    // record the install produces chains back to (activityEnv exports it to the
    // separately-bundled updater as HUB_ACTIVITY_PARENT).
    await emitCairnAction({
      action: "plugin_install_requested",
      subject: { kind: "plugin", id: name, label: name },
      homeId,
      details: { url, message: `Installing ${name} into ${homeById(homeId, homes).label}` },
    }, homes);

    const report = deps.report;
    const hasUpdater = deps.hasUpdater ?? updaterInstalled;
    // Every home needs the plugin manager before it can manage anything else. The
    // manager itself is exempt: it is what is being installed.
    if (!(await isPluginManager(name, dir)) && !(await hasUpdater(dir))) {
      report?.("Installing the plugin manager", 10);
      // The bootstrap has to act on the very home this install targets, so it gets this
      // call's home list rather than resolving its own.
      const ensureUpdater = deps.ensureUpdater
        ?? ((id: string) => import("./engines.js").then((m) => m.ensureEngineIn(PLUGIN_MANAGEMENT, id, { homes })));
      const result = await ensureUpdater(homeId);
      if (!result.ok) throw new Error(result.error);
    }

    const updatePluginPublic = deps.updatePluginPublic ?? requirePluginUpdater(await loadPluginUpdaterIndex()).updatePluginPublic;
    let autoUpdateDefault = true;
    const val = getConfigValue("cairn", "autoUpdateDefault");
    if (typeof val === "boolean") autoUpdateDefault = val;
    report?.("Downloading and building", 40);
    await withHome(dir, async () => {
      await updatePluginPublic(name, url);
      report?.("Registering", 90);
      await realRegisterPlugin(dir, name, url, autoUpdateDefault);
    }, homeId);

    // An app loads the manager through its own config, so a clone alone would leave a
    // manager that is installed but never runs.
    if ((await isPluginManager(name, dir)) && homeId !== "cairn") {
      report?.("Registering with the app", 93);
      await (deps.registerWithApp ?? realRegisterWithApp)(dir, homeId);
    }

    if (homeId !== "cairn") {
      report?.("Syncing to other apps", 95);
      const syncPluginsAcrossApps = deps.syncPluginsAcrossApps ?? realSyncPluginsAcrossApps;
      await syncPluginsAcrossApps(dir);
    }
  });
}

export function pluginsRemoveEverywhere(name: string, deps: PluginsDeps = {}): Promise<Result<InstallManyResult>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const outcomes: InstallOutcome[] = [];
    for (const home of homes) {
      const installed = (await (deps.getPlugins ?? safeGetPlugins)(home.dir)).some((p) => p.name === name);
      if (!installed) continue;
      const res = await pluginsUninstall(home.id, name, deps);
      outcomes.push(res.ok ? { home: home.id, ok: true } : { home: home.id, ok: false, error: res.error });
    }
    return { outcomes };
  });
}

export function pluginsSetEnabled(homeId: PluginHomeId, name: string, on: boolean, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const dir = homeDir(homeId, homes);
    const result = await realSetPluginEnabled(dir, name, on);
    if (result === null) throw new Error("plugin-updater is not available in this build");
    if (!result) throw new Error(`plugin not found: ${name}`);
    await emitCairnAction({
      action: on ? "plugin_enabled" : "plugin_disabled",
      subject: { kind: "plugin", id: name, label: name },
      homeId,
      details: { message: `${on ? "Enabled" : "Disabled"} ${name}` },
    }, homes);
  });
}

export function pluginsSetAutoUpdate(homeId: PluginHomeId, name: string, on: boolean, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const dir = homeDir(homeId, homes);
    const result = await realSetPluginAutoUpdate(dir, name, on);
    if (result === null) throw new Error("plugin-updater is not available in this build");
    if (!result) throw new Error(`plugin not found: ${name}`);
    await emitCairnAction({
      action: "plugin_autoupdate_changed",
      subject: { kind: "plugin", id: name, label: name },
      homeId,
      details: { autoUpdate: on, message: `Auto-update ${on ? "on" : "off"} for ${name}` },
    }, homes);
  });
}

export function pluginsSetChannel(homeId: PluginHomeId, name: string, channel: PluginChannel, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const dir = homeDir(homeId, homes);
    const setChannel = deps.setPluginChannel ?? realSetPluginChannel;
    const result = await setChannel(dir, name, channel);
    if (result === null) throw new Error("plugin-updater is not available in this build");
    if (!result) throw new Error(`plugin not found: ${name}`);
    await emitCairnAction({
      action: "plugin_channel_changed",
      subject: { kind: "plugin", id: name, label: name },
      homeId,
      details: { channel, message: `${name} now tracks ${channel === "experimental" ? "experimental" : "stable"}` },
    }, homes);
  });
}

export function pluginsDowngrade(homeId: PluginHomeId, name: string, hash: string, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const dir = homeDir(homeId, homes);
    const plugin = (await safeGetPlugins(dir)).find((p) => p.name === name);
    if (!plugin) throw new Error(`plugin not found: ${name}`);
    const downgrade = deps.downgrade ?? requirePluginUpdater(await loadPluginUpdaterIndex()).downgrade;
    const result = await withHome(dir, async () => downgrade({ name: plugin.name, url: plugin.url, branch: plugin.branch }, hash), homeId);
    if (result) throw new Error(result);
  });
}

export function pluginsUninstall(homeId: string, name: string, deps: PluginsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const dir = homeDir(homeId as PluginHomeId, homes);
    if ((await safeGetPlugins(dir)).some((p) => p.name === name)) {
      const uninstall = deps.uninstallPlugin ?? requirePluginUpdater(await loadPluginUpdaterIndex()).uninstallPlugin;
      await withHome(dir, async () => uninstall(dir, name), homeId);
      // The plugin is gone, so anything only it declared is now dead weight in the shared store.
      await (deps.prune ?? pruneUnusedLibraries)(dir);
      return;
    }
    const npmList = deps.npmPlugins ?? getNpmPlugins;
    if ((await npmList(dir)).some((p) => p.name === name)) {
      const uninstallNpm = deps.uninstallNpmPlugin ?? requirePluginUpdater(await loadPluginUpdaterNpm()).uninstallNpmPlugin;
      const message = await withHome(dir, async () => uninstallNpm(name, dir), homeId);
      if (message) throw new Error(message);
      return;
    }
    throw new Error(`plugin not found: ${name}`);
  });
}
