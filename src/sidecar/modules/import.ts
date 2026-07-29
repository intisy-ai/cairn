import { existsSync } from "node:fs";
import { join } from "node:path";
import { addAccount, getConfigDir, listAccounts, reposDir } from "@core-auth/index.js";
import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { resolveModelMap } from "@core-proxy/model-map.js";
import { getApps, getAppDescriptor, getConfigValue, setConfigValue } from "@core/index.js";
import type { AppPresence, ImportableApp, ImportPreview, ImportSelection, ImportSummary, Result } from "../../../packages/shared/src/domain.js";
import { appRealHome } from "../lib/pluginHomes.js";
import { profileFor } from "../lib/proxyRegistry.js";
import type { ProxyRegistryDeps } from "../lib/proxyRegistry.js";
import { modelMapWrite } from "../lib/modelMapWrite.js";
import { appsDetect } from "./apps.js";
import { wrap } from "../result.js";

const EXPOSURE_CONFIG_NAME = "dashboard-exposure";
const EXPOSURE_CONFIG_KEY = "map";

export interface ImportDeps {
  appHome?: (app: string) => string;
  proxyDeps?: ProxyRegistryDeps;
}

export async function importApps(deps: ImportDeps = {}): Promise<Result<ImportableApp[]>> {
  const appHome = deps.appHome ?? appRealHome;
  return wrap(async () => {
    const detected = await appsDetect();
    const present: AppPresence = detected.ok ? detected.data : {};
    return getApps()
      .filter((a) => present[a.id])
      .map((a) => ({ app: a.id, label: a.label, hasConfig: existsSync(appHome(a.id)) }));
  });
}

const ALL_SELECTED: ImportSelection = { accounts: true, routing: true, exposure: true };

export async function importPreview(app: string, deps: ImportDeps = {}): Promise<Result<ImportPreview>> {
  const appHome = deps.appHome ?? appRealHome;
  return wrap(async () => {
    if (!getAppDescriptor(app)) throw new Error(`unknown app: ${app}`);
    const home = appHome(app);
    if (!existsSync(home)) throw new Error(`no config found for ${app} at ${home}`);

    const providers = readDeployedProviders(reposDir());
    const accountsOpts = { dir: join(home, "config") };
    let accounts = 0;
    for (const p of providers) accounts += (listAccounts(p.provider, accountsOpts) as unknown[]).length;

    let routingSlots: number | null = null;
    const profile = await profileFor(app, deps.proxyDeps);
    if (profile) {
      const map = resolveModelMap(home, profile);
      routingSlots = Object.values(map).filter((chain) => chain.length > 0).length;
    }

    return { accounts, routingSlots, exposedProviders: providers.length };
  });
}

export async function importRun(app: string, selection: ImportSelection = ALL_SELECTED, deps: ImportDeps = {}): Promise<Result<ImportSummary>> {
  const appHome = deps.appHome ?? appRealHome;
  return wrap(async () => {
    if (!getAppDescriptor(app)) throw new Error(`unknown app: ${app}`);
    const notes: string[] = [];
    const home = appHome(app);
    if (!existsSync(home)) throw new Error(`no config found for ${app} at ${home}`);

    const providers = readDeployedProviders(reposDir());

    let accounts = 0;
    if (selection.accounts) {
      const accountsOpts = { dir: join(home, "config") };
      for (const p of providers) {
        const imported = listAccounts(p.provider, accountsOpts) as unknown[];
        for (const account of imported) addAccount(p.provider, account, undefined);
        accounts += imported.length;
      }
      notes.push(accounts > 0 ? `imported ${accounts} account(s)` : "no accounts to import");
    } else {
      notes.push("accounts skipped");
    }

    let routingImported = false;
    if (selection.routing) {
      const profile = await profileFor(app, deps.proxyDeps);
      if (profile) {
        const map = resolveModelMap(home, profile);
        let tiersWritten = 0;
        for (const slot of Object.keys(map)) {
          const chain = map[slot];
          if (!chain.length) continue;
          modelMapWrite(getConfigDir(), profile, slot, chain.map(({ provider, model }) => ({ provider, model })));
          tiersWritten++;
        }
        routingImported = tiersWritten > 0;
        notes.push(routingImported ? `imported routing for ${tiersWritten} tier(s)` : "no routing to import");
      } else {
        notes.push(`no routing available for ${getAppDescriptor(app)?.label ?? app}`);
      }
    } else {
      notes.push("routing skipped");
    }

    if (selection.exposure) {
      const exposureMap =
        (getConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY) as Record<string, Record<string, boolean>> | undefined) ?? {};
      for (const p of providers) {
        const cur = exposureMap[p.provider] ?? {};
        exposureMap[p.provider] = { ...cur, [app]: true };
      }
      setConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY, exposureMap);
      const label = getAppDescriptor(app)?.label ?? app;
      notes.push(`exposed ${providers.length} provider(s) for ${label}`);
    } else {
      notes.push("provider exposure skipped");
    }

    return { accounts, providers: providers.length, routingImported, notes };
  });
}
