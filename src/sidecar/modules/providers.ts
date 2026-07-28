import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir, activeProvider, setActiveProvider, listAccounts } from "@core-auth/index.js";
import { getConfigValue, setConfigValue } from "@core/index.js";
import { loadProviderDef } from "../lib/providerDef.js";
import type { ProviderRow, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

const EXPOSURE_CONFIG_NAME = "dashboard-exposure";
const EXPOSURE_CONFIG_KEY = "map";
const DEFAULT_EXPOSURE = { cc: true, oc: true };

type ExposureMap = Record<string, { cc: boolean; oc: boolean }>;

function readExposureMap(): ExposureMap {
  return (getConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY) as ExposureMap | undefined) ?? {};
}

function exposureFor(map: ExposureMap, id: string): { cc: boolean; oc: boolean } {
  return map[id] ?? DEFAULT_EXPOSURE;
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

export function providersSetExposure(id: string, app: "cc" | "oc", on: boolean): Promise<Result<void>> {
  return wrap(() => {
    const map = readExposureMap();
    const current = exposureFor(map, id);
    map[id] = { ...current, [app]: on };
    setConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY, map);
  });
}
