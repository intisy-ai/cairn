import type { CairnAPI } from "@cairn/shared";
import { cached, invalidate } from "./cache.js";

declare global {
  interface Window {
    cairn: CairnAPI;
  }
}

// Read methods go through the client cache (name -> TTL ms); every other method is
// a mutation that invalidates the cache after it runs, so the next read is fresh.
const READ_TTL: Record<string, number> = {
  overviewSummary: 30000,
  accountsList: 30000,
  providersList: 30000,
  routingApps: 30000,
  routingGet: 30000,
  proxyStatus: 10000,
  appsDetect: 30000,
  appsList: 60000,
  appsSummary: 30000,
  appStorageGet: 15000,
  appStorageSet: 30000,
  pluginsList: 30000,
  pluginsListCached: 10000,
  pluginsData: 10000,
  librariesList: 30000,
  configSchemas: 30000,
  getConfig: 30000,
  usageSnapshot: 120000,
  importApps: 30000,
  importPreview: 15000,
  catalogList: 60000,
  customEndpointsList: 30000,
  menusList: 30000,
  settingsSections: 30000,
  githubStatus: 15000,
  activityRead: 10000,
};

// Push-listener subscriptions return their unsubscribe function synchronously;
// they must pass straight through rather than being wrapped as an async
// mutation (which would turn the unsubscribe function into a Promise of one).
const PASSTHROUGH = new Set(["onServerStatus", "onDownloadProgress", "onActivityEvent"]);

export const cairn: CairnAPI = new Proxy({} as CairnAPI, {
  get(_target, property) {
    const name = property as string;
    const real = (window.cairn as unknown as Record<string | symbol, unknown>)?.[property];
    if (typeof real !== "function") return real;
    const bound = (real as (...args: unknown[]) => unknown).bind(window.cairn);
    if (name in READ_TTL) {
      return (...args: unknown[]) => cached(name + ":" + JSON.stringify(args), READ_TTL[name], () => bound(...args) as Promise<unknown>);
    }
    if (PASSTHROUGH.has(name)) return bound;
    return async (...args: unknown[]) => {
      const result = await bound(...args);
      invalidate();
      return result;
    };
  },
});
