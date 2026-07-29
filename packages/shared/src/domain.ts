export type { AccountView, AccountQuota, AccountStatus } from "@core-auth/index.js";
export type { Chain, ModelMap, CatalogEntry as ModelCatalogEntry } from "@core-proxy/index.js";
import type { ModelMap, CatalogEntry as ModelCatalogEntry } from "@core-proxy/index.js";
export type CatalogKind = "provider" | "proxy" | "plugin";
export type CatalogEntry = { name: string; url: string; kind: CatalogKind; description: string; deprecated: boolean; topics: string[] };
export type CatalogResult = { entries: CatalogEntry[]; source: "env" | "gh" | "anonymous" };
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
export type HostApp = { id: string; label: string };
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
};
export type UsageAccount = {
  provider: string;
  id: string;
};
export type UsageSessionSource = "opencode" | "claude-code";
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
};
export type UsageSnapshot = {
  accounts: UsageAccount[];
  sessions: UsageSession[];
  models: Record<string, UsageModel>;
  updatedAt: string;
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
  dir: string;
  present: boolean;
  hasUpdater: boolean;
};
export type HomePlugins = { home: PluginHome; rows: PluginRow[] };
export type UnifiedHomeState = { installed: boolean; version?: string | null };
export type UnifiedPlugin = {
  name: string;
  kind: CatalogKind;
  description: string;
  url?: string;
  updateAvailable: boolean;
  homes: Record<string, UnifiedHomeState>;
  topics: string[];
};
export type InstallOutcome = { home: string; ok: boolean; error?: string };
export type InstallManyResult = { outcomes: InstallOutcome[] };
export type PluginConfigSchema = { plugin: string; defaults: Record<string, unknown>; current: Record<string, unknown> };
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
