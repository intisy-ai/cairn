import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@dashboard/shared";
import type { Result } from "@dashboard/shared";

export interface RpcSupervisor {
  rpc(channel: string, args: unknown[]): Promise<Result<unknown>>;
}

export function registerHandlers(supervisor: RpcSupervisor): void {
  for (const channel of IPC_CHANNELS.invoke) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => supervisor.rpc(channel, args));
  }
}
