import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "@dashboard/shared";
import type { CairnAPI, Result, OverviewSummary, AccountView, ProviderRow, ProxyStatus, RoutingState, RoutingApp, Chain, AppPresence, CliResult, PluginRow, UsageSnapshot, ImportableApp, ImportSummary } from "@dashboard/shared";

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
  pluginsList: () => safeInvoke("plugins:list") as Promise<Result<PluginRow[]>>,
  pluginsInstall: (name, url) => safeInvoke("plugins:install", name, url) as Promise<Result<void>>,
  pluginsSetEnabled: (name, on) => safeInvoke("plugins:setEnabled", name, on) as Promise<Result<void>>,
  pluginsDowngrade: (name, hash) => safeInvoke("plugins:downgrade", name, hash) as Promise<Result<void>>,
  usageSnapshot: () => safeInvoke("usage:snapshot") as Promise<Result<UsageSnapshot>>,
  importApps: () => safeInvoke("import:apps") as Promise<Result<ImportableApp[]>>,
  importRun: (app) => safeInvoke("import:run", app) as Promise<Result<ImportSummary>>,
  minimize: () => safeSend("window:minimize"),
  maximize: () => safeSend("window:maximize"),
  close: () => safeSend("window:close"),
  onServerStatus: (listener) => safeOn("server:status", (status) => listener(status as ProxyStatus)),
  isElectron: true,
  platform: process.platform,
};

contextBridge.exposeInMainWorld("cairn", api);
