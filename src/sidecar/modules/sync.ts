import { getConfigDir } from "@core-auth/index.js";
import { setConfigValue } from "@core/index.js";
import { readSyncStatus, syncAllAcrossApps } from "@plugin-updater/syncbridge.js";
import type { Result, SyncStatus } from "../../../packages/shared/src/domain.js";
import { pluginHomes } from "../lib/pluginHomes.js";
import { wrap } from "../result.js";

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
  const read = deps.status ?? readSyncStatus;
  return wrap(async () => {
    const status = (await read(getConfigDir())) as SyncStatus | null;
    return status ?? FALLBACK;
  });
}

export function syncRun(deps: SyncDeps = {}): Promise<Result<void>> {
  const run = deps.run ?? syncAllAcrossApps;
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
