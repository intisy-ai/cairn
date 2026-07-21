export type { AccountView } from "@core-auth/index.js";
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type OverviewSummary = {
  providersConnected: number;
  accountsTotal: number;
  serverRunning: boolean;
  serverPort: number;
};
