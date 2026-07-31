import type { Result } from "../../packages/shared/src/domain.js";
import { err } from "./result.js";
import { configGet, configSet } from "./modules/config.js";
import { overviewSummary } from "./modules/overview.js";
import { accountsList, accountsEnable, accountsRemove, accountsRefreshQuota } from "./modules/accounts.js";
import { accountsLoginBegin, accountsLoginComplete, accountsLoginCancel } from "./modules/accountsLogin.js";
import { providersList, providersSetActive, providersSetExposure } from "./modules/providers.js";
import { routingApps, routingGet, routingSetChain } from "./modules/routing.js";
import { appsDetect, appsList, appsInstallCli, appsInit, appsUninstallCli, appsSummary, appsConnection, appsInstallLoader } from "./modules/apps.js";
import { pluginsList, pluginVersions, pluginsInstall, pluginsInstallMany, pluginsRemoveEverywhere, pluginsSetEnabled, pluginsDowngrade, pluginsUninstall } from "./modules/plugins.js";
import { enginesList, ensureEngines, ensureEngine } from "./modules/engines.js";
import { proxiesList, proxiesSetEnabled } from "./modules/proxies.js";
import { repoMeta } from "./modules/repo.js";
import { configSchemas, configWrite, configAction } from "./modules/appConfig.js";
import { syncStatus, syncRun, syncSetConfig } from "./modules/sync.js";
import { ledgerHomes, ledgerCommit, ledgerRestore, ledgerDiffRefs, ledgerProfileCreate, ledgerProfileSwitch } from "./modules/ledger.js";
import { busDrain } from "./modules/bus.js";
import type { PluginHomeId } from "../../packages/shared/src/domain.js";
import { usageSnapshot } from "./modules/usage.js";
import { importApps, importPreview, importRun } from "./modules/import.js";
import type { ImportSelection } from "../../packages/shared/src/domain.js";
import { catalogList } from "./modules/catalog.js";
import { customEndpointsList, customEndpointsUpsert, customEndpointsRemove, customEndpointsSaveKey } from "./modules/customEndpoints.js";
import type { CustomEndpoint } from "../../packages/shared/src/domain.js";

type SidecarRequest = { id: number; channel: string; args: unknown[] };
type SidecarResponse = { id: number; result: Result<unknown> };

type SidecarHandler = (...args: unknown[]) => Promise<Result<unknown>>;

const handlers: Record<string, SidecarHandler> = {};

export function registerHandler(channel: string, handler: SidecarHandler): void {
  handlers[channel] = handler;
}

export async function dispatch(channel: string, args: unknown[]): Promise<Result<unknown>> {
  const handler = handlers[channel];
  if (!handler) return err(`no handler registered for channel: ${channel}`);
  try {
    return await handler(...args);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

registerHandler("config:get", (name, key) => configGet(name as string, key as string));
registerHandler("config:set", (name, key, value) => configSet(name as string, key as string, value));
registerHandler("overview:summary", () => overviewSummary());
registerHandler("accounts:list", (provider) => accountsList(provider as string));
registerHandler("accounts:enable", (provider, id, on) => accountsEnable(provider as string, id as string, on as boolean));
registerHandler("accounts:remove", (provider, id) => accountsRemove(provider as string, id as string));
registerHandler("accounts:refreshQuota", (provider) => accountsRefreshQuota(provider as string));
registerHandler("accounts:loginBegin", (provider) => accountsLoginBegin(provider as string));
registerHandler("accounts:loginComplete", (provider, input) => accountsLoginComplete(provider as string, input as string));
registerHandler("accounts:loginCancel", (provider) => accountsLoginCancel(provider as string));
registerHandler("providers:list", () => providersList());
registerHandler("providers:setActive", (id) => providersSetActive(id as string));
registerHandler("providers:setExposure", (id, app, on) => providersSetExposure(id as string, app as string, on as boolean));
registerHandler("routing:apps", () => routingApps());
registerHandler("routing:get", (app) => routingGet(app as string));
registerHandler("routing:setChain", (app, slot, chain) => routingSetChain(app as string, slot as string, chain));
registerHandler("apps:detect", () => appsDetect());
registerHandler("apps:list", () => appsList());
registerHandler("apps:installCli", (app) => appsInstallCli(app as string));
registerHandler("apps:init", (app) => appsInit(app as string));
registerHandler("apps:uninstallCli", (app, wipeData) => appsUninstallCli(app as string, wipeData as boolean));
registerHandler("apps:summary", (app) => appsSummary(app as string));
registerHandler("apps:connection", (app) => appsConnection(app as string));
registerHandler("apps:installLoader", (app) => appsInstallLoader(app as string));
registerHandler("repo:meta", (url) => repoMeta(url as string));
registerHandler("plugins:list", () => pluginsList());
registerHandler("plugins:versions", (name) => pluginVersions(name as string));
registerHandler("engines:list", () => enginesList());
registerHandler("engines:ensure", (capability) => ensureEngine(capability as string));
registerHandler("plugins:install", (home, name, url) => pluginsInstall(home as PluginHomeId, name as string, url as string));
registerHandler("plugins:installMany", (name, url, homeIds) => pluginsInstallMany(name as string, url as string, homeIds as string[]));
registerHandler("plugins:removeEverywhere", (name) => pluginsRemoveEverywhere(name as string));
registerHandler("plugins:setEnabled", (home, name, on) => pluginsSetEnabled(home as PluginHomeId, name as string, on as boolean));
registerHandler("plugins:downgrade", (home, name, hash) => pluginsDowngrade(home as PluginHomeId, name as string, hash as string));
registerHandler("plugins:uninstall", (home, name) => pluginsUninstall(home as string, name as string));
registerHandler("proxies:list", () => proxiesList());
registerHandler("proxies:setEnabled", (name, on) => proxiesSetEnabled(name as string, on as boolean));
registerHandler("config:schemas", (home) => configSchemas(home as string));
registerHandler("config:write", (home, plugin, key, value) => configWrite(home as string, plugin as string, key as string, value));
registerHandler("config:action", (home, plugin, actionId) => configAction(home as string, plugin as string, actionId as string));
registerHandler("sync:status", () => syncStatus());
registerHandler("sync:run", () => syncRun());
registerHandler("sync:setConfig", (key, value) => syncSetConfig(key as string, value));
registerHandler("ledger:homes", () => ledgerHomes());
registerHandler("ledger:commit", (home, reason) => ledgerCommit(home as string, reason as string));
registerHandler("ledger:restore", (home, ref) => ledgerRestore(home as string, ref as string));
registerHandler("ledger:diffRefs", (home, refA, refB) => ledgerDiffRefs(home as string, refA as string, refB as string));
registerHandler("ledger:profileCreate", (home, name) => ledgerProfileCreate(home as string, name as string));
registerHandler("ledger:profileSwitch", (home, name) => ledgerProfileSwitch(home as string, name as string));
registerHandler("bus:drain", () => busDrain());
registerHandler("usage:snapshot", () => usageSnapshot());
registerHandler("import:apps", () => importApps());
registerHandler("import:preview", (app) => importPreview(app as string));
registerHandler("import:run", (app, selection) => importRun(app as string, selection as ImportSelection | undefined));
registerHandler("catalog:list", () => catalogList());
registerHandler("customEndpoints:list", () => customEndpointsList());
registerHandler("customEndpoints:upsert", (endpoint) => customEndpointsUpsert(endpoint as CustomEndpoint));
registerHandler("customEndpoints:remove", (id) => customEndpointsRemove(id as string));
registerHandler("customEndpoints:saveKey", (endpointId, key) => customEndpointsSaveKey(endpointId as string, key as string));

if (process.parentPort) {
  process.parentPort.on("message", (messageEvent) => {
    const { id, channel, args } = messageEvent.data as SidecarRequest;
    dispatch(channel, args).then((result) => {
      const response: SidecarResponse = { id, result };
      process.parentPort.postMessage(response);
    });
  });
  // Prewarm the transcript cache so the first Usage view doesn't sit on a
  // multi-second cold scan of the full session history.
  void usageSnapshot();
  void ensureEngines().catch(() => undefined);
}
