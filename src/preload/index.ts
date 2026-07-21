import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "@dashboard/shared";
import type { IntisyAPI, Result, OverviewSummary, AccountView } from "@dashboard/shared";

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

const api: IntisyAPI = {
  getConfig: (name, key) => safeInvoke("config:get", name, key) as Promise<Result<unknown>>,
  setConfig: (name, key, value) => safeInvoke("config:set", name, key, value) as Promise<Result<void>>,
  overviewSummary: () => safeInvoke("overview:summary") as Promise<Result<OverviewSummary>>,
  accountsList: (provider) => safeInvoke("accounts:list", provider) as Promise<Result<AccountView[]>>,
  accountsEnable: (provider, id, on) => safeInvoke("accounts:enable", provider, id, on) as Promise<Result<void>>,
  accountsRemove: (provider, id) => safeInvoke("accounts:remove", provider, id) as Promise<Result<void>>,
  accountsRefreshQuota: (provider) => safeInvoke("accounts:refreshQuota", provider) as Promise<Result<AccountView[]>>,
  minimize: () => safeSend("window:minimize"),
  isElectron: true,
  platform: process.platform,
};

contextBridge.exposeInMainWorld("intisy", api);
