import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir, activeProvider, setActiveProvider, listAccounts } from "@core-auth/index.js";
import { getApps, getConfigValue, setConfigValue } from "@core/index.js";
import { loadProviderDef } from "../lib/providerDef.js";
import type { ProviderRow, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

const EXPOSURE_CONFIG_NAME = "dashboard-exposure";
const EXPOSURE_CONFIG_KEY = "map";
const LEGACY_KEYS: Record<string, string> = { cc: "claude", oc: "opencode" };

type ExposureMap = Record<string, Record<string, boolean>>;

function defaultExposure(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const app of getApps()) out[app.id] = true;
  return out;
}

function migrateEntry(entry: Record<string, boolean>): { migrated: Record<string, boolean>; changed: boolean } {
  let changed = false;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(entry)) {
    const mapped = LEGACY_KEYS[k];
    if (mapped) {
      out[mapped] = v;
      changed = true;
    } else {
      out[k] = v;
    }
  }
  return { migrated: out, changed };
}

// Legacy exposure entries were keyed by the old cc/oc shorthand; re-key them to app ids once on read and persist the migration.
function readExposureMap(): ExposureMap {
  const raw = (getConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY) as ExposureMap | undefined) ?? {};
  let anyChanged = false;
  const out: ExposureMap = {};
  for (const [id, entry] of Object.entries(raw)) {
    const { migrated, changed } = migrateEntry(entry ?? {});
    out[id] = migrated;
    anyChanged = anyChanged || changed;
  }
  if (anyChanged) setConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY, out);
  return out;
}

function exposureFor(map: ExposureMap, id: string): Record<string, boolean> {
  const stored = map[id] ?? {};
  return { ...defaultExposure(), ...stored };
}

export function providersList(): Promise<Result<ProviderRow[]>> {
  return wrap(async () => {
    const deployed = readDeployedProviders(reposDir());
    const active = activeProvider();
    const exposureMap = readExposureMap();
    const rows: ProviderRow[] = [];
    for (const provider of deployed) {
      const def = await loadProviderDef(provider.handlerPath);
      rows.push({
        id: provider.provider,
        label: def?.label ?? provider.provider,
        hasOAuth: def?.hasOAuth ?? false,
        accountCount: listAccounts(provider.provider, undefined).length,
        active: active === provider.provider,
        exposure: exposureFor(exposureMap, provider.provider),
        translator: provider.translator,
      });
    }
    return rows;
  });
}

export function providersSetActive(id: string): Promise<Result<void>> {
  return wrap(() => {
    setActiveProvider(id);
  });
}

export function providersSetExposure(id: string, appId: string, on: boolean): Promise<Result<void>> {
  return wrap(() => {
    const map = readExposureMap();
    const current = exposureFor(map, id);
    map[id] = { ...current, [appId]: on };
    setConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY, map);
  });
}
