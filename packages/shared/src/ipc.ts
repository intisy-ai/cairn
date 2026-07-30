import type { CairnAPI } from "./api.js";

// Method name (on CairnAPI) to IPC channel string. This is the single source for
// the request/response surface: the preload builds its bridge from this map, and
// the main-process allow-list + router derive their channel list from it. Add a
// channel here (plus its CairnAPI signature and sidecar handler) and every layer
// picks it up.
export const INVOKE_CHANNELS = {
  getConfig: "config:get",
  setConfig: "config:set",
  overviewSummary: "overview:summary",
  accountsList: "accounts:list",
  accountsEnable: "accounts:enable",
  accountsRemove: "accounts:remove",
  accountsRefreshQuota: "accounts:refreshQuota",
  accountsLoginBegin: "accounts:loginBegin",
  accountsLoginComplete: "accounts:loginComplete",
  accountsLoginCancel: "accounts:loginCancel",
  providersList: "providers:list",
  providersSetActive: "providers:setActive",
  providersSetExposure: "providers:setExposure",
  routingApps: "routing:apps",
  routingGet: "routing:get",
  routingSetChain: "routing:setChain",
  proxyStatus: "proxy:status",
  proxyStart: "proxy:start",
  proxyStop: "proxy:stop",
  proxiesList: "proxies:list",
  proxiesSetEnabled: "proxies:setEnabled",
  appsDetect: "apps:detect",
  appsList: "apps:list",
  appsInstallCli: "apps:installCli",
  appsInit: "apps:init",
  appsUninstallCli: "apps:uninstallCli",
  appsSummary: "apps:summary",
  pluginsList: "plugins:list",
  enginesList: "engines:list",
  enginesEnsure: "engines:ensure",
  pluginsInstall: "plugins:install",
  pluginsInstallMany: "plugins:installMany",
  pluginsRemoveEverywhere: "plugins:removeEverywhere",
  pluginsSetEnabled: "plugins:setEnabled",
  pluginsDowngrade: "plugins:downgrade",
  pluginsUninstall: "plugins:uninstall",
  configSchemas: "config:schemas",
  configWrite: "config:write",
  configAction: "config:action",
  syncStatus: "sync:status",
  syncRun: "sync:run",
  syncSetConfig: "sync:setConfig",
  ledgerHomes: "ledger:homes",
  ledgerCommit: "ledger:commit",
  ledgerRestore: "ledger:restore",
  ledgerDiffRefs: "ledger:diffRefs",
  ledgerProfileCreate: "ledger:profileCreate",
  ledgerProfileSwitch: "ledger:profileSwitch",
  busDrain: "bus:drain",
  usageSnapshot: "usage:snapshot",
  importApps: "import:apps",
  importPreview: "import:preview",
  importRun: "import:run",
  catalogList: "catalog:list",
  customEndpointsList: "customEndpoints:list",
  customEndpointsUpsert: "customEndpoints:upsert",
  customEndpointsRemove: "customEndpoints:remove",
  customEndpointsSaveKey: "customEndpoints:saveKey",
} as const;

export type InvokeMethod = keyof typeof INVOKE_CHANNELS;
export type InvokeChannel = (typeof INVOKE_CHANNELS)[InvokeMethod];

export const IPC_CHANNELS = {
  invoke: Object.values(INVOKE_CHANNELS) as readonly InvokeChannel[],
  send: ["window:minimize", "window:maximize", "window:close"] as const,
  receive: ["server:status"] as const,
};

// The methods on CairnAPI that are NOT request/response invocations (window
// controls, the push subscription, and the static flags).
type NonInvokeMethod = "minimize" | "maximize" | "close" | "onServerStatus" | "isElectron" | "platform";
type ApiInvokeMethod = Exclude<keyof CairnAPI, NonInvokeMethod>;
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

// Compile-time guard: INVOKE_CHANNELS maps exactly CairnAPI's invoke methods, no
// more and no less. A drift on either side turns this into `never` and fails the build.
const _invokeChannelsMatchApi: Exact<InvokeMethod, ApiInvokeMethod> = true;
void _invokeChannelsMatchApi;
