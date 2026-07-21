import type { Result, OverviewSummary } from "./domain.js";
export interface IntisyAPI {
  getConfig(name: string, key: string): Promise<Result<unknown>>;
  setConfig(name: string, key: string, value: unknown): Promise<Result<void>>;
  overviewSummary(): Promise<Result<OverviewSummary>>;
  minimize(): void;
  isElectron: true;
  platform: NodeJS.Platform;
}
