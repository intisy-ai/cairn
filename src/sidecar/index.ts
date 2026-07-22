import type { Result } from "../../packages/shared/src/domain.js";
import { err } from "./result.js";
import { configGet, configSet } from "./modules/config.js";
import { overviewSummary } from "./modules/overview.js";
import { accountsList, accountsEnable, accountsRemove, accountsRefreshQuota } from "./modules/accounts.js";
import { providersList, providersSetActive, providersSetExposure } from "./modules/providers.js";
import { routingApps, routingGet, routingSetChain } from "./modules/routing.js";
import { appsDetect, appsInstallCli, appsInit } from "./modules/apps.js";
import type { AppName } from "./modules/apps.js";
import { pluginsList, pluginsInstall, pluginsSetEnabled, pluginsDowngrade } from "./modules/plugins.js";
import type { PluginHomeId } from "../../packages/shared/src/domain.js";
import { usageSnapshot } from "./modules/usage.js";
import { importApps, importRun } from "./modules/import.js";
import { catalogList } from "./modules/catalog.js";

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
registerHandler("providers:list", () => providersList());
registerHandler("providers:setActive", (id) => providersSetActive(id as string));
registerHandler("providers:setExposure", (id, app, on) => providersSetExposure(id as string, app as "cc" | "oc", on as boolean));
registerHandler("routing:apps", () => routingApps());
registerHandler("routing:get", (app) => routingGet(app as string));
registerHandler("routing:setChain", (app, slot, chain) => routingSetChain(app as string, slot as string, chain));
registerHandler("apps:detect", () => appsDetect());
registerHandler("apps:installCli", (app) => appsInstallCli(app as AppName));
registerHandler("apps:init", (app) => appsInit(app as AppName));
registerHandler("plugins:list", () => pluginsList());
registerHandler("plugins:install", (home, name, url) => pluginsInstall(home as PluginHomeId, name as string, url as string));
registerHandler("plugins:setEnabled", (home, name, on) => pluginsSetEnabled(home as PluginHomeId, name as string, on as boolean));
registerHandler("plugins:downgrade", (home, name, hash) => pluginsDowngrade(home as PluginHomeId, name as string, hash as string));
registerHandler("usage:snapshot", () => usageSnapshot());
registerHandler("import:apps", () => importApps());
registerHandler("import:run", (app) => importRun(app as string));
registerHandler("catalog:list", () => catalogList());

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
}
