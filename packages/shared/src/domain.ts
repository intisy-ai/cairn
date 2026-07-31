export type { AccountView, AccountQuota, AccountStatus } from "@core-auth/index.js";
export type { Chain, ModelMap, CatalogEntry as ModelCatalogEntry } from "@core-proxy/index.js";
import type { ModelMap, CatalogEntry as ModelCatalogEntry } from "@core-proxy/index.js";
export type CatalogKind = "provider" | "proxy" | "plugin" | "loader";
export type CatalogEntry = { name: string; url: string; kind: CatalogKind; description: string; deprecated: boolean; topics: string[]; displayName?: string; icon?: string };
export type RepoMeta = { owner: string; repo: string; htmlUrl: string; stars: number | null; description: string; topics: string[]; readme: string | null };
export type CatalogResult = { entries: CatalogEntry[]; source: "env" | "gh" | "anonymous"; org: string };
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type ProviderHealth = {
  provider: string;
  accounts: number;
  quotaMinPct: number | null;
};
export type OverviewSummary = {
  providersConnected: number;
  accountsTotal: number;
  accountsEnabled: number;
  appsDetected: number;
  pluginsInstalled: number;
  providerHealth: ProviderHealth[];
  serverRunning: boolean;
  serverPort: number;
};
export type ProxyStatus = {
  running: boolean;
  port: number;
};
export type ProxyView = { name: string; app: string; appLabel: string; enabled: boolean; setup?: string };
export type ProviderRow = {
  id: string;
  label: string;
  hasOAuth: boolean;
  accountCount: number;
  active: boolean;
  exposure: Record<string, boolean>;
  translator?: string;
};
export type RoutingState = {
  tiers: string[];
  map: ModelMap;
  catalog: ModelCatalogEntry[];
};
export type AppPresence = Record<string, boolean>;
export type HostApp = { id: string; label: string; icon?: string };
export type AppConnection = { app: string; cliPresent: boolean; loaderId: string | null; loaderUrl: string | null; loaderInstalled: boolean };
export type CliResult = {
  stdout: string;
  stderr: string;
};
export type PluginRow = {
  name: string;
  kind: "git" | "npm";
  enabled: boolean;
  url?: string;
  installedVersion?: string | null;
  updateAvailable: boolean;
  description: string;
  displayName?: string;
  icon?: string;
};
export type UsageAccount = {
  provider: string;
  id: string;
};
export type UsageSessionSource = string;
export type UsageTokens = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
};
export type UsageDay = {
  tokens: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  messageCount: number;
};
export type UsageSessionModel = {
  id: string;
  provider: string;
  tokens: number;
};
export type UsageSession = {
  id: string;
  title: string;
  tokens: UsageTokens;
  messageCount: number;
  source: UsageSessionSource;
  updated: number;
  costByDay: Record<string, UsageDay>;
  models: UsageSessionModel[];
};
export type UsageModel = {
  provider: string;
  tokens: { input: number; output: number; reasoning: number };
  sessionCount: number;
  messageCount: number;
  estimatedCostUsd?: number;
  priced?: boolean;
};
export type UsageSnapshot = {
  accounts: UsageAccount[];
  sessions: UsageSession[];
  models: Record<string, UsageModel>;
  updatedAt: string;
  estimatedCostUsd?: number;
  pricedModels?: number;
  unpricedModels?: number;
  pricesUpdatedAt?: string;
};
export type ImportableApp = { app: string; label: string; hasConfig: boolean };
export type ImportSummary = { accounts: number; providers: number; routingImported: boolean; notes: string[] };
export type ImportSelection = { accounts: boolean; routing: boolean; exposure: boolean };
export type ImportPreview = { accounts: number; routingSlots: number | null; exposedProviders: number };
export type RoutingApp = { app: string; label: string };
export type SyncCategories = { accounts: boolean; plugins: boolean; settings: boolean; pluginConfigs: boolean };
export type SyncStatus = { enabled: boolean; categories: SyncCategories; exclude: string[]; homes: string[]; pluginConfigs: string[] };

export type PluginHomeId = string;
export type PluginHome = {
  id: PluginHomeId;
  label: string;
  icon?: string;
  dir: string;
  present: boolean;
  hasUpdater: boolean;
};
export type HomePlugins = { home: PluginHome; rows: PluginRow[] };
export type PluginVersion = { kind: "git" | "npm"; label: string | null; updateAvailable: boolean; autoUpdate: boolean };
export type EngineHomeState = { installed: boolean; enabled: boolean };
export type EngineView = { id: string; capability: string; url: string; homes: Record<string, EngineHomeState> };
export type UnifiedHomeState = { installed: boolean; version?: string | null };
export type UnifiedPlugin = {
  name: string;
  kind: CatalogKind;
  description: string;
  url?: string;
  updateAvailable: boolean;
  homes: Record<string, UnifiedHomeState>;
  topics: string[];
  displayName: string;
  icon: string;
  // True when the plugin's repo owner is not the configured marketplace org, i.e.
  // it was installed from an outside source rather than the trusted catalog.
  external: boolean;
};
export type InstallOutcome = { home: string; ok: boolean; error?: string };
export type InstallManyResult = { outcomes: InstallOutcome[] };
// Pushed from the sidecar during an install so a download row can show its live
// step; id correlates to the caller's download-task id. percent is coarse
// phase-based progress 0..100 (-1 when indeterminate).
export type DownloadProgress = { id: number; step: string; percent: number };
export type FieldType = "boolean" | "number" | "string" | "secret" | "select" | "multiline" | "list";
export type FieldSpec = {
  key: string;
  type: FieldType;
  label?: string;
  description?: string;
  group?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  itemType?: "string" | "number";
  placeholder?: string;
};
export type ActionSpec = { id: string; label: string; description?: string; confirm?: string; danger?: boolean };
export type PluginConfigSchema = {
  plugin: string;
  defaults: Record<string, unknown>;
  current: Record<string, unknown>;
  fields?: FieldSpec[];
  actions?: ActionSpec[];
};
export type AppAccountSummary = { provider: string; label: string; enabled: boolean; quotaPct: number | null };
export type AppProviderAgg = { provider: string; accounts: number; enabled: number };
export type AppSummary = {
  accounts: AppAccountSummary[];
  providerCount: number;
  accountsEnabled: number;
  providerBreakdown: AppProviderAgg[];
  quotaMinPct: number | null;
  configDir: string;
  pluginCount: number;
  routingSlots: number | null;
};
export const SUPPORTED_ENDPOINT_FORMATS = ["openai"] as const;
export type EndpointFormat = (typeof SUPPORTED_ENDPOINT_FORMATS)[number];
export type CustomEndpoint = { id: string; label: string; baseUrl: string; format: string; models: string[] };
export type CustomEndpointView = CustomEndpoint & { hasKey: boolean };

export type ConfigSnapshot = { hash: string; date: string; subject: string };
export type ConfigDiffRow = { file: string; key: string; old: string; new: string };
export type ConfigProfilesView = { list: string[]; current: string };
export type ConfigHomeView = {
  homeId: PluginHomeId;
  label: string;
  icon?: string;
  present: boolean;
  snapshots: ConfigSnapshot[];
  pending: ConfigDiffRow[];
  profiles: ConfigProfilesView;
};
export type ProfileSwitchResult = { ok: boolean; reason?: string };
export type BusEvent = { topic: string; source: string; ts: number; payload: unknown };
export type LoginBegin = { url: string; instructions: string; loopback?: boolean };
export type LoginComplete = { added: boolean; label?: string };
