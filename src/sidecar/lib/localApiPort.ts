import { getConfigValue } from "@intisy-ai/core";
import { PROXY_PORT } from "../../../packages/shared/src/proxy.js";

// The local API port is user-configurable (cairn config `localApiPort`); every
// process that needs it resolves through here so the value and its fallback live
// in one place. An unset or out-of-range value falls back to the shared default.
export const LOCAL_API_PORT_CONFIG = { name: "cairn", key: "localApiPort" } as const;

export function resolveLocalApiPort(configDir?: string): number {
  try {
    const raw = getConfigValue(LOCAL_API_PORT_CONFIG.name, LOCAL_API_PORT_CONFIG.key, configDir);
    const port = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : PROXY_PORT;
  } catch {
    return PROXY_PORT;
  }
}
