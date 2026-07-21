import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir, listAccounts } from "@core-auth/index.js";
import type { UsageSnapshot, UsageAccount, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

export function usageSnapshot(): Promise<Result<UsageSnapshot>> {
  return wrap(() => {
    const deployed = readDeployedProviders(reposDir());
    const accounts: UsageAccount[] = [];
    for (const provider of deployed) {
      const providerAccounts = listAccounts(provider.provider, undefined) as { id: string }[];
      for (const account of providerAccounts) {
        accounts.push({ provider: provider.provider, id: account.id });
      }
    }
    // Real session/cost data comes from the vendored metric-dashboard snapshot layer in SP 3.4; empty here by design.
    return { accounts, sessions: [], models: {}, updatedAt: new Date().toISOString() };
  });
}
