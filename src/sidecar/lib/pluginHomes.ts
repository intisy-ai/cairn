import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getConfigDir } from "@core-auth/index.js";
import { getPluginsPath } from "@plugin-updater/config.js";
import { appsDetect } from "../modules/apps.js";
import type { AppPresence, PluginHome, PluginHomeId, Result } from "../../../packages/shared/src/domain.js";

export function appRealHome(app: "claude" | "opencode", env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  if (app === "claude") {
    return existsSync(join(home, ".claude")) ? join(home, ".claude") : join(home, ".config", "claude");
  }
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg && xdg.trim()) return join(xdg.trim(), "opencode");
  return existsSync(join(home, ".config", "opencode")) ? join(home, ".config", "opencode") : join(home, ".opencode");
}

export interface PluginHomesDeps {
  detect?: () => Promise<Result<AppPresence>>;
  cairnDir?: string;
  exists?: (path: string) => boolean;
}

export async function pluginHomes(deps: PluginHomesDeps = {}): Promise<PluginHome[]> {
  const detect = deps.detect ?? appsDetect;
  const exists = deps.exists ?? existsSync;
  const cairnDir = deps.cairnDir ?? getConfigDir();
  const detected = await detect();
  const present = detected.ok ? detected.data : { claude: false, opencode: false };
  const app = (id: "claude" | "opencode", label: string): PluginHome => {
    const dir = appRealHome(id);
    return { id, label, dir, present: present[id], hasUpdater: exists(getPluginsPath(dir)) };
  };
  return [
    { id: "cairn", label: "Cairn", dir: cairnDir, present: true, hasUpdater: true },
    app("claude", "Claude Code"),
    app("opencode", "OpenCode"),
  ];
}

export function homeDir(homeId: PluginHomeId, homes: PluginHome[]): string {
  const home = homes.find((h) => h.id === homeId);
  if (!home) throw new Error(`unknown plugin home: ${homeId}`);
  return home.dir;
}
