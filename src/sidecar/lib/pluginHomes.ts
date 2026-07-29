import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getConfigDir } from "@core-auth/index.js";
import { getPluginsPath } from "@plugin-updater/config.js";
import { getApps, getAppDescriptor, resolveHome } from "@core/index.js";
import { appsDetect } from "../modules/apps.js";
import type { AppPresence, PluginHome, PluginHomeId, Result } from "../../../packages/shared/src/domain.js";

export function appRealHome(app: string, env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const desc = getAppDescriptor(app, env, home);
  return desc ? resolveHome(desc, env, home) : "";
}

export interface PluginHomesDeps {
  detect?: () => Promise<Result<AppPresence>>;
  cairnDir?: string;
  exists?: (path: string) => boolean;
  appHome?: (app: string) => string;
}

export async function pluginHomes(deps: PluginHomesDeps = {}): Promise<PluginHome[]> {
  const detect = deps.detect ?? appsDetect;
  const exists = deps.exists ?? existsSync;
  const cairnDir = deps.cairnDir ?? getConfigDir();
  const appHomeForId = deps.appHome ?? appRealHome;
  const detected = await detect();
  const present: AppPresence = detected.ok ? detected.data : {};
  const appHomes: PluginHome[] = getApps().map((desc) => {
    const dir = appHomeForId(desc.id);
    return { id: desc.id, label: desc.label, dir, present: !!present[desc.id], hasUpdater: exists(getPluginsPath(dir)) };
  });
  return [
    { id: "cairn", label: "Cairn", dir: cairnDir, present: true, hasUpdater: true },
    ...appHomes,
  ];
}

export function homeDir(homeId: PluginHomeId, homes: PluginHome[]): string {
  const home = homes.find((h) => h.id === homeId);
  if (!home) throw new Error(`unknown plugin home: ${homeId}`);
  return home.dir;
}
