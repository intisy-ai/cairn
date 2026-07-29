import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir, activeProvider, setActiveProvider, listAccounts } from "@core-auth/index.js";
import { loadProviderDef } from "../lib/providerDef.js";
import { exposureFor, readExposureMap, setExposure } from "../lib/exposure.js";
import type { ProviderRow, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

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
    setExposure(id, appId, on);
  });
}
