import { getConfigDir } from "@core-auth/index.js";
import { setConfigValue } from "@core/index.js";
import type { Result, SyncStatus } from "../../../packages/shared/src/domain.js";
import { pluginHomes } from "../lib/pluginHomes.js";
import { loadPluginUpdaterSyncbridge } from "../lib/optionalEngines.js";
import { wrap } from "../result.js";

// plugin-updater carries the sync-bridge engine; with it absent there is nothing
// to report or run, so status falls back to "disabled" and a run is a no-op.
async function safeReadSyncStatus(configDir: string): Promise<unknown | null> {
  const mod = await loadPluginUpdaterSyncbridge();
  return mod ? mod.readSyncStatus(configDir) : null;
}

async function safeSyncAllAcrossApps(configDir: string): Promise<void> {
  const mod = await loadPluginUpdaterSyncbridge();
  if (mod) await mod.syncAllAcrossApps(configDir);
}

const FALLBACK: SyncStatus = {
  enabled: false,
  categories: { accounts: false, plugins: false, settings: false, pluginConfigs: false },
  exclude: [],
  homes: [],
  pluginConfigs: [],
};

export interface SyncDeps {
  status?: (configDir: string) => Promise<unknown | null>;
  run?: (configDir: string) => Promise<void>;
  homes?: () => Promise<{ id: string; dir: string; present: boolean }[]>;
  writeConfig?: (name: string, key: string, value: unknown, configDir: string) => void;
}

export function syncStatus(deps: SyncDeps = {}): Promise<Result<SyncStatus>> {
  const read = deps.status ?? safeReadSyncStatus;
  return wrap(async () => {
    const status = (await read(getConfigDir())) as SyncStatus | null;
    return status ?? FALLBACK;
  });
}

export function syncRun(deps: SyncDeps = {}): Promise<Result<void>> {
  const run = deps.run ?? safeSyncAllAcrossApps;
  return wrap(async () => {
    await run(getConfigDir());
  });
}

// sync-bridge reads its config from the host-app homes (not Cairn's home), so
// write the setting into every present host app home to keep them consistent.
export function syncSetConfig(key: string, value: unknown, deps: SyncDeps = {}): Promise<Result<void>> {
  const listHomes = deps.homes ?? pluginHomes;
  const write = deps.writeConfig ?? setConfigValue;
  return wrap(async () => {
    const homes = (await listHomes()).filter((h) => h.id !== "cairn" && h.present);
    for (const home of homes) write("sync-bridge", key, value, home.dir);
  });
}
