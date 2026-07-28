import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir, listAccounts } from "@core-auth/index.js";
import { buildSnapshot } from "../../../vendor/usage/snapshot.js";
import type { Session, ModelSummary, DayUsage, ModelUsage } from "../../../vendor/usage/types.js";
import type {
  UsageSnapshot,
  UsageAccount,
  UsageSession,
  UsageModel,
  UsageDay,
  UsageSessionModel,
  Result,
} from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

function deployedAccounts(): UsageAccount[] {
  const accounts: UsageAccount[] = [];
  for (const provider of readDeployedProviders(reposDir())) {
    const providerAccounts = listAccounts(provider.provider, undefined) as { id: string }[];
    for (const account of providerAccounts) accounts.push({ provider: provider.provider, id: account.id });
  }
  return accounts;
}

function mapDay(day: DayUsage): UsageDay {
  return {
    tokens: day.tokens,
    tokensInput: day.tokensInput,
    tokensOutput: day.tokensOutput,
    tokensReasoning: day.tokensReasoning,
    messageCount: day.messageCount,
  };
}

function mapSessionModels(modelUsage: Record<string, ModelUsage>): UsageSessionModel[] {
  return Object.entries(modelUsage).map(([id, usage]) => ({
    id,
    provider: usage.provider,
    tokens: usage.tokens.input + usage.tokens.output + usage.tokens.reasoning,
  }));
}

function mapSession(session: Session): UsageSession {
  const costByDay: Record<string, UsageDay> = {};
  for (const [day, usage] of Object.entries(session.costByDay)) costByDay[day] = mapDay(usage);
  return {
    id: session.id,
    title: session.title,
    tokens: session.tokens,
    messageCount: session.messageCount,
    source: session.source,
    updated: session.updated,
    costByDay,
    models: mapSessionModels(session.modelUsage),
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

// A cold scan streams the full transcript history and takes many seconds;
// concurrent callers (the startup prewarm plus a Usage view) share one scan.
let inFlight: Promise<Result<UsageSnapshot>> | null = null;

export function usageSnapshot(): Promise<Result<UsageSnapshot>> {
  if (inFlight) return inFlight;
  inFlight = usageSnapshotOnce().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function usageSnapshotOnce(): Promise<Result<UsageSnapshot>> {
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
