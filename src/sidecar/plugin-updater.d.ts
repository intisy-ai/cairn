// plugin-updater is an OPTIONAL engine plugin (see lib/optionalEngines.ts): its dist may be
// absent when the sibling repo is not checked out. When present, the real .d.ts files shipped
// in its dist take precedence over these; this shim only keeps typecheck working when the
// alias target can't be resolved at all, mirroring config-ledger.d.ts's shim for the same reason.
declare module "@plugin-updater/types.js" {
  export interface Plugin {
    name: string;
    url?: string;
    branch?: string;
    enabled?: boolean;
    autoUpdate?: boolean;
    updateInterval?: number;
    sync?: boolean;
    commitHash?: string | null;
  }
  export interface NpmPlugin {
    name: string;
    version: string;
    installed: boolean;
    raw: string;
  }
}

declare module "@plugin-updater/config.js" {
  import type { Plugin } from "@plugin-updater/types.js";
  export function readOpencodeJson(configDir: string): { plugins: string[]; raw: Record<string, unknown> };
  export function getPluginsPath(configDir: string): string;
  export function getPlugins(configDir: string): Plugin[];
  export function registerPlugin(configDir: string, name: string, url: string, autoUpdate?: boolean): void;
  export function setPluginEnabled(configDir: string, name: string, enabled: boolean): boolean;
  export function setPluginAutoUpdate(configDir: string, name: string, autoUpdate: boolean): boolean;
}

declare module "@plugin-updater/cache.js" {
  export interface CachePluginEntry {
    kind: "git" | "npm";
    installedVersion: string | null;
    localHead: string | null;
    remoteHead: string | null;
    latestVersion: string | null;
    updateAvailable: boolean;
    updatedAt: string | null;
  }
  export interface UpdateCache {
    checkedAt: string;
    plugins: Record<string, CachePluginEntry>;
  }
  export function readUpdateCache(configDir: string): UpdateCache;
}

declare module "@plugin-updater/syncbridge.js" {
  export function syncPluginsAcrossApps(configDir: string): Promise<void>;
  export function syncAllAcrossApps(configDir: string): Promise<void>;
  export function readSyncStatus(configDir: string): Promise<unknown | null>;
}

declare module "@plugin-updater/env.js" {
  export function setEarlyLaunchConfigDir(dir: string): void;
}

declare module "@plugin-updater/npm.js" {
  import type { NpmPlugin } from "@plugin-updater/types.js";
  export function getNpmPlugins(configDir: string): NpmPlugin[];
  export function uninstallNpmPlugin(name: string, configDir: string): string;
}

declare module "@plugin-updater/index.js" {
  export function updatePluginPublic(pluginName: string, gitUrl: string, branch?: string, commitHash?: string): Promise<void | object>;
  export function downgrade(plugin: { name: string; url?: string; branch?: string }, commitHash: string): string;
  export function uninstallPlugin(configDir: string, name: string): void;
}
