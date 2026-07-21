import type { Result, OverviewSummary, AccountView } from "./domain.js";
export interface IntisyAPI {
  getConfig(name: string, key: string): Promise<Result<unknown>>;
  setConfig(name: string, key: string, value: unknown): Promise<Result<void>>;
  overviewSummary(): Promise<Result<OverviewSummary>>;
  accountsList(provider: string): Promise<Result<AccountView[]>>;
  accountsEnable(provider: string, id: string, on: boolean): Promise<Result<void>>;
  accountsRemove(provider: string, id: string): Promise<Result<void>>;
  accountsRefreshQuota(provider: string): Promise<Result<AccountView[]>>;
  minimize(): void;
  isElectron: true;
  platform: NodeJS.Platform;
}
