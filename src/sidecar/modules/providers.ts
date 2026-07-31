import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir, listAccounts } from "@core-auth/index.js";
import { getApps } from "@core/index.js";
import { loadProviderDef } from "../lib/providerDef.js";
import { exposureFor, readExposureMap, setExposure } from "../lib/exposure.js";
import type { ProviderRow, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

export function providersList(): Promise<Result<ProviderRow[]>> {
  return wrap(async () => {
    const deployed = readDeployedProviders(reposDir());
    const exposureMap = readExposureMap();
    const rows: ProviderRow[] = [];
    for (const provider of deployed) {
      const def = await loadProviderDef(provider.handlerPath);
      const exposure = exposureFor(exposureMap, provider.provider);
      rows.push({
        id: provider.provider,
        label: def?.label ?? provider.provider,
        authKind: def?.hasOAuth ? "oauth" : "api-key",
        accountCount: listAccounts(provider.provider, undefined).length,
        enabled: Object.values(exposure).some(Boolean),
        exposure,
        translator: provider.translator,
      });
    }
    return rows;
  });
}

export function providersSetEnabled(id: string, on: boolean): Promise<Result<void>> {
  return wrap(() => {
    for (const app of getApps()) setExposure(id, app.id, on);
  });
}

export function providersSetExposure(id: string, appId: string, on: boolean): Promise<Result<void>> {
  return wrap(() => {
    setExposure(id, appId, on);
  });
}
