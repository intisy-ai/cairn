import { homedir } from "node:os";
import { join } from "node:path";
import { getConfigDir } from "@core-auth/index.js";
import { getPlugins, readOpencodeJson } from "@plugin-updater/config.js";
import { getApps, getAppDescriptor, resolveHome } from "@core/index.js";
import { appsDetect } from "../modules/apps.js";
import { svgIconDataUri } from "./pluginIcon.js";
import { renderCairnMark } from "../../../packages/shared/src/logo.js";
import type { AppPresence, PluginHome, PluginHomeId, Result } from "../../../packages/shared/src/domain.js";

export function appRealHome(app: string, env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const desc = getAppDescriptor(app, env, home);
  return desc ? resolveHome(desc, env, home) : "";
}

// "Has the updater" means plugin-updater is actually installed in this home (a git
// entry or opencode's npm plugin list), NOT merely that a plugins.json exists. The
// gate and the download source label both hinge on this being accurate.
export function updaterInstalled(dir: string): boolean {
  try {
    if (getPlugins(dir).some((p) => p.name === "plugin-updater")) return true;
    return readOpencodeJson(dir).plugins.some((p) => p.includes("plugin-updater"));
  } catch {
    return false;
  }
}

export interface PluginHomesDeps {
  detect?: () => Promise<Result<AppPresence>>;
  cairnDir?: string;
  hasUpdater?: (dir: string) => boolean;
  appHome?: (app: string) => string;
}

export async function pluginHomes(deps: PluginHomesDeps = {}): Promise<PluginHome[]> {
  const detect = deps.detect ?? appsDetect;
  const hasUpdater = deps.hasUpdater ?? updaterInstalled;
  const cairnDir = deps.cairnDir ?? getConfigDir();
  const appHomeForId = deps.appHome ?? appRealHome;
  const detected = await detect();
  const present: AppPresence = detected.ok ? detected.data : {};
  const appHomes: PluginHome[] = getApps().map((desc) => {
    const dir = appHomeForId(desc.id);
    // AppDescriptor.icon is a raw SVG mark; the renderer's PluginIcon needs a
    // data URI, matching how plugin icon.svg files are surfaced.
    const icon = desc.icon ? svgIconDataUri(desc.icon) : undefined;
    return { id: desc.id, label: desc.label, icon, dir, present: !!present[desc.id], hasUpdater: hasUpdater(dir) };
  });
  return [
    // Cairn bundles the updater to perform installs, but it ships with no plugins:
    // until plugin-updater is installed here too, only engines can be added.
    { id: "cairn", label: "Cairn", icon: renderCairnMark(), dir: cairnDir, present: true, hasUpdater: hasUpdater(cairnDir) },
    ...appHomes,
  ];
}

export function homeDir(homeId: PluginHomeId, homes: PluginHome[]): string {
  const home = homes.find((h) => h.id === homeId);
  if (!home) throw new Error(`unknown plugin home: ${homeId}`);
  return home.dir;
}
