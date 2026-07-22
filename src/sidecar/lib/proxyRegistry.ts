import { loadInstalledProxyDefs } from "./proxyPlugins.js";
import type { LoadedProxyDef } from "./proxyPlugins.js";
import type { RoutingProfile } from "@core-proxy/index.js";
import type { RoutingApp } from "../../../packages/shared/src/domain.js";

export type { RoutingApp };

export interface ProxyRegistryDeps {
  defs?: () => Promise<LoadedProxyDef[]>;
}

export async function availableRoutingApps(
  present: { claude: boolean; opencode: boolean },
  deps: ProxyRegistryDeps = {},
): Promise<RoutingApp[]> {
  const defs = await (deps.defs ?? loadInstalledProxyDefs)();
  return defs.filter((d) => present[d.app]).map((d) => ({ app: d.app, label: d.label }));
}

export async function profileFor(app: string, deps: ProxyRegistryDeps = {}): Promise<RoutingProfile | null> {
  const defs = await (deps.defs ?? loadInstalledProxyDefs)();
  return defs.find((d) => d.app === app)?.profile() ?? null;
}
