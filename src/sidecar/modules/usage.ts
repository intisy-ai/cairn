import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir, listAccounts } from "@core-auth/index.js";
import { buildSnapshot } from "../../../vendor/usage/snapshot.js";
import type { Session, ModelSummary } from "../../../vendor/usage/types.js";
import type { UsageSnapshot, UsageAccount, UsageSession, UsageModel, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

function deployedAccounts(): UsageAccount[] {
  const accounts: UsageAccount[] = [];
  for (const provider of readDeployedProviders(reposDir())) {
    const providerAccounts = listAccounts(provider.provider, undefined) as { id: string }[];
    for (const account of providerAccounts) accounts.push({ provider: provider.provider, id: account.id });
  }
  return accounts;
}

function mapSession(session: Session): UsageSession {
  return {
    id: session.id,
    title: session.title,
    tokens: session.tokens,
    messageCount: session.messageCount,
    source: session.source,
    updated: session.updated,
  };
}

function mapModels(models: ModelSummary): Record<string, UsageModel> {
  const mapped: Record<string, UsageModel> = {};
  for (const [modelId, entry] of Object.entries(models)) {
    mapped[modelId] = {
      provider: entry.provider,
      tokens: entry.tokens,
      sessionCount: entry.sessionCount,
      messageCount: entry.messageCount,
    };
  }
  return mapped;
}

export function usageSnapshot(): Promise<Result<UsageSnapshot>> {
  return wrap(async () => {
    const snapshot = await buildSnapshot();
    return {
      accounts: deployedAccounts(),
      sessions: snapshot.sessions.map(mapSession),
      models: mapModels(snapshot.models),
      updatedAt: new Date(snapshot.updatedAt).toISOString(),
    };
  });
}
