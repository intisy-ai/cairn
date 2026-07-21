// Filesystem locations for the usage snapshot layer. The accounts store lives
// under the dashboard's own HUB_CONFIG_DIR (core-auth's configFolder), while
// OpenCode and Claude Code session data live under THEIR OWN app homes, which
// do not necessarily match HUB_CONFIG_DIR, so each is resolved independently.
import { join } from "path";
import { homedir } from "os";
import { configFolder } from "@core-auth/index.js";

function trimmed(value: string | undefined): string {
  return value && value.trim() ? value.trim() : "";
}

export function opencodeConfigDir(): string {
  const forced = trimmed(process.env.HUB_OPENCODE_DIR) || trimmed(process.env.OPENCODE_CONFIG_DIR);
  if (forced) return forced;
  const xdg = trimmed(process.env.XDG_CONFIG_HOME);
  if (xdg) return join(xdg, "opencode");
  return join(homedir(), ".config", "opencode");
}

export function opencodeStorageDir(): string {
  return join(opencodeConfigDir(), "data", "storage");
}

export function claudeProjectsDir(): string {
  const forced = trimmed(process.env.HUB_CLAUDE_DIR) || trimmed(process.env.CLAUDE_CONFIG_DIR);
  const base = forced || join(homedir(), ".claude");
  return join(base, "projects");
}

export function accountsConfigFolder(): string {
  return configFolder();
}

export function defaultDbPath(): string {
  const forced = trimmed(process.env.HUB_OPENCODE_DATA_DIR);
  if (forced) return join(forced, "opencode.db");
  return join(homedir(), ".local", "share", "opencode", "opencode.db");
}
