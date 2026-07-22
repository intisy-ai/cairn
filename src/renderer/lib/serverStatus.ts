import { writable } from "svelte/store";
import type { ProxyStatus } from "@cairn/shared";
import { cairn } from "./ipc.js";

export const serverStatus = writable<ProxyStatus | null>(null);

export function watchServerStatus(): () => void {
  return cairn.onServerStatus((status) => serverStatus.set(status));
}
