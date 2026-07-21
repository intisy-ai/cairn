export type { AccountView } from "@core-auth/index.js";
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
