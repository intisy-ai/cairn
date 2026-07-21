export type { AccountView } from "@core-auth/index.js";
export type { Chain, ModelMap, CatalogEntry } from "@core-proxy/index.js";
import type { ModelMap, CatalogEntry } from "@core-proxy/index.js";
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type OverviewSummary = {
  providersConnected: number;
  accountsTotal: number;
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
  exposure: { cc: boolean; oc: boolean };
};
export type RoutingState = {
  tiers: string[];
  map: ModelMap;
  catalog: CatalogEntry[];
};
export type AppPresence = {
  claude: boolean;
  opencode: boolean;
};
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
};
