import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@cairn/shared";
import type { Result } from "@cairn/shared";
import * as proxyDaemon from "../daemon/proxyDaemon.js";
import { wrap } from "../../sidecar/result.js";

export interface RpcSupervisor {
  rpc(channel: string, args: unknown[], timeoutMs?: number): Promise<Result<unknown>>;
}

// proxy:* runs against the MAIN-process daemon (a singleton that must outlive sidecar
// reforks), not the sidecar, so these channels are wired directly here instead of through
// the generic supervisor-forwarding loop below.
const MAIN_HANDLED = new Set(["proxy:status", "proxy:start", "proxy:stop"]);

// Channels that do real work (git clone + npm install + build, a full usage scan,
// a cross-app sync) need deadlines far wider than the supervisor's 15s default.
const LONG_MS = 600000;
const CHANNEL_TIMEOUTS: Record<string, number> = {
  "usage:snapshot": 120000,
  "plugins:install": LONG_MS,
  "plugins:installMany": LONG_MS,
  "plugins:removeEverywhere": LONG_MS,
  "plugins:uninstall": LONG_MS,
  "plugins:downgrade": LONG_MS,
  "apps:installCli": LONG_MS,
  "apps:init": LONG_MS,
  "apps:uninstallCli": LONG_MS,
  "sync:run": LONG_MS,
  "import:run": LONG_MS,
};

export function registerHandlers(supervisor: RpcSupervisor): void {
  for (const channel of IPC_CHANNELS.invoke) {
    if (MAIN_HANDLED.has(channel)) continue;
    ipcMain.handle(channel, (_event, ...args: unknown[]) => supervisor.rpc(channel, args, CHANNEL_TIMEOUTS[channel]));
  }

  ipcMain.handle("proxy:status", () => wrap(() => proxyDaemon.status()));
  ipcMain.handle("proxy:start", () => wrap(() => proxyDaemon.start()));
  ipcMain.handle("proxy:stop", () => wrap(() => proxyDaemon.stop()));
}
