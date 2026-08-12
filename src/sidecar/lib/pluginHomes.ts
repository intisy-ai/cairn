import { homedir } from "node:os";
import { getApps, getAppDescriptor, resolveHome } from "@core/index.js";
import { resolveStoreDir } from "../../main/lib/storeDir.js";
import { appsDetect } from "../modules/apps.js";
import { renderCairnMark } from "../../../packages/shared/src/logo.js";
import { svgIconDataUri } from "./pluginIcon.js";
import type { Plugin } from "@intisy-ai/plugin-updater/dist/types.js";
import type { AppPresence, PluginHome, PluginHomeId, Result } from "../../../packages/shared/src/domain.js";
import { safeGetPlugins, loadPluginUpdaterConfig } from "./optionalEngines.js";

export function appRealHome(app: string, env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const desc = getAppDescriptor(app, env, home);
  return desc ? resolveHome(desc, env, home) : "";
}

// Cairn's OWN home: the store directory main launches the sidecar against, holding its
// config, repos, accounts and logs. Anything about Cairn itself (its plugin home, where
// an install lands, the home its activity is stamped with and its background updates run
// against) asks here, and gets the same directory `HUB_CONFIG_DIR` already points every
// other sidecar path at.
//
// @implNote Neither of the two directories this used to name will do. core-auth's
// getConfigDir falls back to the ACTIVE APP's home when HUB_CONFIG_DIR is unset, which
// once made "install into Cairn" write into Claude's home. The app registry's directory
// is a fixed global path so loaders and providers inside Claude or OpenCode can find it
// without HUB_CONFIG_DIR, and naming it here pointed the plugin list, installs and
// background updates at a directory nothing else ever wrote to.
export function cairnHome(): string {
  const forced = process.env.HUB_CONFIG_DIR?.trim();
  return forced || resolveStoreDir(process.env, process.platform, homedir());
}

// "Has the updater" means plugin-updater is actually installed in this home (a git
// entry or opencode's npm plugin list), NOT merely that a plugins.json exists. The
// gate and the download source label both hinge on this being accurate. When
// plugin-updater itself is not part of this build, no home can have it installed.
export async function updaterInstalled(dir: string): Promise<boolean> {
  try {
    if ((await safeGetPlugins(dir)).some((p) => p.name === "plugin-updater")) return true;
    const config = await loadPluginUpdaterConfig();
    if (!config) return false;
    return config.readOpencodeJson(dir).plugins.some((p) => p.includes("plugin-updater"));
  } catch {
    return false;
  }
}

// An app is connected through its loader, so a home whose loader is absent cannot load
// anything the ecosystem installs there. Both the Apps view and the plugin home list ask
// this, and a second copy of the rule is how the two came to disagree elsewhere.
export async function loaderInstalled(
  dir: string,
  loaderId?: string,
  listPlugins: (dir: string) => Plugin[] | Promise<Plugin[]> = safeGetPlugins,
): Promise<boolean> {
  if (!loaderId) return false;
  try {
    return (await listPlugins(dir)).some((p) => p.name === loaderId);
  } catch {
    return false;
  }
}

export interface PluginHomesDeps {
  detect?: () => Promise<Result<AppPresence>>;
  cairnDir?: string;
  hasUpdater?: (dir: string) => boolean | Promise<boolean>;
  hasLoader?: (dir: string, loaderId?: string) => boolean | Promise<boolean>;
  appHome?: (app: string) => string;
}

export async function pluginHomes(deps: PluginHomesDeps = {}): Promise<PluginHome[]> {
  const detect = deps.detect ?? appsDetect;
  const hasUpdater = deps.hasUpdater ?? updaterInstalled;
  const hasLoader = deps.hasLoader ?? loaderInstalled;
  const cairnDir = deps.cairnDir ?? cairnHome();
  const appHomeForId = deps.appHome ?? appRealHome;
  const detected = await detect();
  const present: AppPresence = detected.ok ? detected.data : {};
  const appHomes: PluginHome[] = await Promise.all(
    getApps().map(async (desc) => {
      const dir = appHomeForId(desc.id);
      return {
        id: desc.id,
        label: desc.label,
        icon: desc.icon ? svgIconDataUri(desc.icon) : undefined,
        dir,
        present: !!present[desc.id],
        hasUpdater: await hasUpdater(dir),
        loaderId: desc.loader?.id,
        loaderInstalled: await hasLoader(dir, desc.loader?.id),
      };
    }),
  );
  return [
    // Cairn bundles the updater to perform installs, but it ships with no plugins:
    // until plugin-updater is installed here too, only engines can be added.
    { id: "cairn", label: "Cairn", icon: renderCairnMark(), dir: cairnDir, present: true, hasUpdater: await hasUpdater(cairnDir) },
    ...appHomes,
  ];
}

export function homeById(homeId: PluginHomeId, homes: PluginHome[]): PluginHome {
  const home = homes.find((h) => h.id === homeId);
  if (!home) throw new Error(`unknown plugin home: ${homeId}`);
  return home;
}

export function homeDir(homeId: PluginHomeId, homes: PluginHome[]): string {
  return homeById(homeId, homes).dir;
}
