import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "@cairn/shared";
import type { CairnAPI, Result, OverviewSummary, AccountView, ProviderRow, ProxyStatus, RoutingState, RoutingApp, Chain, AppPresence, CliResult, HomePlugins, UsageSnapshot, ImportableApp, ImportSummary, CatalogResult, AppSummary, PluginConfigSchema } from "@cairn/shared";

const invokeChannels: readonly string[] = IPC_CHANNELS.invoke;
const sendChannels: readonly string[] = IPC_CHANNELS.send;
const receiveChannels: readonly string[] = IPC_CHANNELS.receive;

function safeInvoke(channel: string, ...args: unknown[]): Promise<Result<unknown>> {
  if (!invokeChannels.includes(channel)) {
    return Promise.resolve({ ok: false, error: `channel not allowed: ${channel}` });
  }
  return ipcRenderer.invoke(channel, ...args);
}

function safeSend(channel: string, ...args: unknown[]): void {
  if (!sendChannels.includes(channel)) return;
  ipcRenderer.send(channel, ...args);
}

export function safeOn(channel: string, listener: (...args: unknown[]) => void): () => void {
  if (!receiveChannels.includes(channel)) return () => {};
  const wrapped = (_event: IpcRendererEvent, ...args: unknown[]): void => listener(...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api: CairnAPI = {
  getConfig: (name, key) => safeInvoke("config:get", name, key) as Promise<Result<unknown>>,
  setConfig: (name, key, value) => safeInvoke("config:set", name, key, value) as Promise<Result<void>>,
  overviewSummary: () => safeInvoke("overview:summary") as Promise<Result<OverviewSummary>>,
  accountsList: (provider) => safeInvoke("accounts:list", provider) as Promise<Result<AccountView[]>>,
  accountsEnable: (provider, id, on) => safeInvoke("accounts:enable", provider, id, on) as Promise<Result<void>>,
  accountsRemove: (provider, id) => safeInvoke("accounts:remove", provider, id) as Promise<Result<void>>,
  accountsRefreshQuota: (provider) => safeInvoke("accounts:refreshQuota", provider) as Promise<Result<AccountView[]>>,
  providersList: () => safeInvoke("providers:list") as Promise<Result<ProviderRow[]>>,
  providersSetActive: (id) => safeInvoke("providers:setActive", id) as Promise<Result<void>>,
  providersSetExposure: (id, app, on) => safeInvoke("providers:setExposure", id, app, on) as Promise<Result<void>>,
  routingApps: () => safeInvoke("routing:apps") as Promise<Result<RoutingApp[]>>,
  routingGet: (app) => safeInvoke("routing:get", app) as Promise<Result<RoutingState>>,
  routingSetChain: (app, slot, chain) => safeInvoke("routing:setChain", app, slot, chain) as Promise<Result<{ warnings: string[] }>>,
  proxyStatus: () => safeInvoke("proxy:status") as Promise<Result<ProxyStatus>>,
  proxyStart: () => safeInvoke("proxy:start") as Promise<Result<void>>,
  proxyStop: () => safeInvoke("proxy:stop") as Promise<Result<void>>,
  appsDetect: () => safeInvoke("apps:detect") as Promise<Result<AppPresence>>,
  appsInstallCli: (app) => safeInvoke("apps:installCli", app) as Promise<Result<CliResult>>,
  appsInit: (app) => safeInvoke("apps:init", app) as Promise<Result<CliResult>>,
  appsUninstallCli: (app, wipeData) => safeInvoke("apps:uninstallCli", app, wipeData) as Promise<Result<CliResult>>,
  appsSummary: (app) => safeInvoke("apps:summary", app) as Promise<Result<AppSummary>>,
  pluginsList: () => safeInvoke("plugins:list") as Promise<Result<HomePlugins[]>>,
  pluginsInstall: (home, name, url) => safeInvoke("plugins:install", home, name, url) as Promise<Result<void>>,
  pluginsSetEnabled: (home, name, on) => safeInvoke("plugins:setEnabled", home, name, on) as Promise<Result<void>>,
  pluginsDowngrade: (home, name, hash) => safeInvoke("plugins:downgrade", home, name, hash) as Promise<Result<void>>,
  pluginsUninstall: (home, name) => safeInvoke("plugins:uninstall", home, name) as Promise<Result<void>>,
  configSchemas: (home) => safeInvoke("config:schemas", home) as Promise<Result<PluginConfigSchema[]>>,
  configWrite: (home, plugin, key, value) => safeInvoke("config:write", home, plugin, key, value) as Promise<Result<void>>,
  usageSnapshot: () => safeInvoke("usage:snapshot") as Promise<Result<UsageSnapshot>>,
  importApps: () => safeInvoke("import:apps") as Promise<Result<ImportableApp[]>>,
  importRun: (app) => safeInvoke("import:run", app) as Promise<Result<ImportSummary>>,
  catalogList: () => safeInvoke("catalog:list") as Promise<Result<CatalogResult>>,
  minimize: () => safeSend("window:minimize"),
  maximize: () => safeSend("window:maximize"),
  close: () => safeSend("window:close"),
  onServerStatus: (listener) => safeOn("server:status", (status) => listener(status as ProxyStatus)),
  isElectron: true,
  platform: process.platform,
};

contextBridge.exposeInMainWorld("cairn", api);
