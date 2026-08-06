import { writable } from "svelte/store";
import type { ProxyStatus } from "@cairn/shared";
import { cairn } from "./ipc.js";

// null means NOT YET KNOWN, which is deliberately distinct from stopped: treating unknown as
// running is what made a stopped proxy show as online.
export const serverStatus = writable<ProxyStatus | null>(null);

export function watchServerStatus(): () => void {
  // Status is pushed only on transitions, so a proxy that was already stopped when the window
  // opened never pushes anything. This initial read is what makes the first paint truthful.
  void cairn.proxyStatus().then((result) => {
    if (result.ok) serverStatus.set(result.data);
  });
  return cairn.onServerStatus((status) => serverStatus.set(status));
}
