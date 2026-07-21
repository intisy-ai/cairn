import { join as joinWin } from "node:path/win32";
import { join as joinPosix } from "node:path/posix";

export function resolveStoreDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): string {
  if (platform === "win32") return joinWin(env.APPDATA || joinWin(home, "AppData", "Roaming"), "intisy");
  if (platform === "darwin") return joinPosix(home, "Library", "Application Support", "intisy");
  return joinPosix(env.XDG_CONFIG_HOME || joinPosix(home, ".config"), "intisy");
}
