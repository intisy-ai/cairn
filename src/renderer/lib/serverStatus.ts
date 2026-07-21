import { writable } from "svelte/store";
import type { ProxyStatus } from "@dashboard/shared";
import { intisy } from "./ipc.js";

export const serverStatus = writable<ProxyStatus | null>(null);

export function watchServerStatus(): () => void {
  return intisy.onServerStatus((status) => serverStatus.set(status));
}
