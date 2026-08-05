import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { loadProviderDefs, type ProviderDef } from "@core-loader/provider-def.js";
import { reposDir, listAccounts } from "@core-auth/index.js";
import { getApps } from "@core/index.js";
import { exposureFor, readExposureMap, setExposure } from "../lib/exposure.js";
import type { ProviderRow, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";
import { emitCairnAction } from "../activity.js";

export function providersList(): Promise<Result<ProviderRow[]>> {
  return wrap(async () => {
    const deployed = readDeployedProviders(reposDir());
    const exposureMap = readExposureMap();

    // A handler module can back several deployed entries (a shared handler backing
    // multiple providers); import it once and reuse the resolved defs for all of them.
    const defsByHandler = new Map<string, Promise<ProviderDef[]>>();
    function defsFor(handlerPath: string): Promise<ProviderDef[]> {
      let cached = defsByHandler.get(handlerPath);
      if (!cached) {
        cached = loadProviderDefs(handlerPath);
        defsByHandler.set(handlerPath, cached);
      }
      return cached;
    }

    const rows: ProviderRow[] = [];
    for (const entry of deployed) {
      const defs = await defsFor(entry.handlerPath);
      const def = defs.find((d) => d.id === entry.provider) ?? defs[0] ?? null;
      const accountPool = def?.accountPool ?? entry.accountPool;
      const exposure = exposureFor(exposureMap, entry.provider);
      rows.push({
        id: entry.provider,
        label: def?.label ?? entry.provider,
        authKind: def?.hasOAuth ? "oauth" : "api-key",
        accountCount: listAccounts(accountPool, undefined).length,
        enabled: Object.values(exposure).some(Boolean),
        exposure,
        translator: entry.translator,
        accountPool,
        sharedWith: [],
        pluginName: entry.repo,
      });
    }

    // sharedWith is computed across the full list, not per-entry: two providers
    // (from the same or different plugins) that declare the same accountPool
    // cross-link each other here.
    const idsByPool = new Map<string, string[]>();
    for (const row of rows) {
      const ids = idsByPool.get(row.accountPool) ?? [];
      ids.push(row.id);
      idsByPool.set(row.accountPool, ids);
    }
    for (const row of rows) {
      row.sharedWith = (idsByPool.get(row.accountPool) ?? []).filter((id) => id !== row.id);
    }

    return rows;
  });
}

export function providersSetEnabled(id: string, on: boolean): Promise<Result<void>> {
  return wrap(async () => {
    for (const app of getApps()) setExposure(id, app.id, on);
    await emitCairnAction({
      action: on ? "provider_enabled" : "provider_disabled",
      subject: { kind: "provider", id, label: id },
      topic: "provider.state",
      details: { message: `${on ? "Enabled" : "Disabled"} ${id} everywhere` },
    });
  });
}

export function providersSetExposure(id: string, appId: string, on: boolean): Promise<Result<void>> {
  return wrap(async () => {
    setExposure(id, appId, on);
    await emitCairnAction({
      action: "provider_exposure_changed",
      subject: { kind: "provider", id, label: id },
      topic: "provider.state",
      homeId: appId,
      details: { exposed: on, message: `${id} ${on ? "exposed to" : "hidden from"} ${appId}` },
    });
  });
}
