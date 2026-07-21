import type { IntisyAPI } from "@dashboard/shared";

function defaultIntisy(): IntisyAPI {
  return {
    getConfig: async () => ({ ok: true, data: undefined }),
    setConfig: async () => ({ ok: true, data: undefined }),
    overviewSummary: async () => ({
      ok: true,
      data: { providersConnected: 0, accountsTotal: 0, serverRunning: false, serverPort: 34567 },
    }),
    accountsList: async () => ({ ok: true, data: [] }),
    accountsEnable: async () => ({ ok: true, data: undefined }),
    accountsRemove: async () => ({ ok: true, data: undefined }),
    accountsRefreshQuota: async () => ({ ok: true, data: [] }),
    providersList: async () => ({ ok: true, data: [] }),
    providersSetActive: async () => ({ ok: true, data: undefined }),
    providersSetExposure: async () => ({ ok: true, data: undefined }),
    routingGet: async () => ({ ok: true, data: { tiers: [], map: { default: [] }, catalog: [] } }),
    routingSetChain: async () => ({ ok: true, data: undefined }),
    proxyStatus: async () => ({ ok: true, data: { running: false, port: 34567 } }),
    proxyStart: async () => ({ ok: true, data: undefined }),
    proxyStop: async () => ({ ok: true, data: undefined }),
    appsDetect: async () => ({ ok: true, data: { claude: false, opencode: false } }),
    appsInstallCli: async () => ({ ok: true, data: { stdout: "", stderr: "" } }),
    appsInit: async () => ({ ok: true, data: { stdout: "", stderr: "" } }),
    pluginsList: async () => ({ ok: true, data: [] }),
    pluginsInstall: async () => ({ ok: true, data: undefined }),
    pluginsSetEnabled: async () => ({ ok: true, data: undefined }),
    pluginsDowngrade: async () => ({ ok: true, data: undefined }),
    usageSnapshot: async () => ({ ok: true, data: { accounts: [], sessions: [], models: {}, updatedAt: "" } }),
    minimize: () => {},
    maximize: () => {},
    close: () => {},
    onServerStatus: () => () => {},
    isElectron: true,
    platform: "linux",
  };
}

export function stubIntisy(overrides: Partial<IntisyAPI> = {}): void {
  (globalThis as { window: Window }).window.intisy = { ...defaultIntisy(), ...overrides };
}
