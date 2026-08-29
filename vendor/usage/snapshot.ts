// Local snapshot assembly: accounts (from basekit/auth's unified account store)
// plus sessions and models (from buildSessionsWithCosts/buildModelSummary),
// bucketed by day.
import { join } from "path";
import { configFolder } from "@intisy-ai/basekit/auth";
import { readJSON } from "./db.js";
import { buildSessionsWithCosts, buildModelSummary } from "./sessions.js";
import type { AccountSummary, DayUsage, QuotaInfo, RateLimitInfo, UsageSnapshotData } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return new Date(value).getTime();
  return null;
}

// Normalizes a provider's quota cache into { <pool>: {remaining, resetTime} }.
// Shapes seen in the wild: antigravity stores meta.cachedQuota[pool] =
// {remainingFraction, resetTime}; claude-code stores cachedQuota.pools[bucket] =
// {utilization, reset} (legacy: {fiveHour, sevenDay}); older per-provider files
// store a flat per-model map. Pools are passed through as-is, nothing hardcoded.
export function normalizeQuotas(account: Record<string, unknown>): Record<string, QuotaInfo> {
  const quotas: Record<string, QuotaInfo> = {};

  const meta = isRecord(account["meta"]) ? account["meta"] : null;
  const metaQuota = meta && isRecord(meta["cachedQuota"]) ? meta["cachedQuota"] : null;
  if (metaQuota) {
    for (const [pool, raw] of Object.entries(metaQuota)) {
      if (!isRecord(raw)) continue;
      const remainingFraction = raw["remainingFraction"];
      quotas[pool] = {
        remaining: typeof remainingFraction === "number" ? remainingFraction : null,
        resetTime: toTimestamp(raw["resetTime"]),
        modelCount: typeof raw["modelCount"] === "number" ? (raw["modelCount"] as number) : undefined,
      };
    }
  }

  const cachedQuota = isRecord(account["cachedQuota"]) ? account["cachedQuota"] : null;
  if (cachedQuota) {
    const explicitPools = isRecord(cachedQuota["pools"]) ? cachedQuota["pools"] : null;
    let pools = explicitPools;
    if (!pools) {
      const built: Record<string, unknown> = {};
      if (isRecord(cachedQuota["fiveHour"])) built["5-hour"] = cachedQuota["fiveHour"];
      if (isRecord(cachedQuota["sevenDay"])) built["7-day"] = cachedQuota["sevenDay"];
      pools = built;
    }
    for (const [bucket, raw] of Object.entries(pools)) {
      if (!isRecord(raw)) continue;
      const utilization = raw["utilization"];
      if (typeof utilization !== "number") continue;
      const reset = raw["reset"];
      quotas[bucket] = {
        remaining: Math.max(0, Math.min(1, 1 - utilization)),
        resetTime: typeof reset === "number" ? reset : null,
      };
    }

    // Top-level per-model shape (legacy per-provider account files).
    if (Object.keys(quotas).length === 0 && !explicitPools && !isRecord(cachedQuota["fiveHour"])) {
      for (const [model, raw] of Object.entries(cachedQuota)) {
        if (!isRecord(raw)) continue;
        const remainingFraction = raw["remainingFraction"];
        if (typeof remainingFraction !== "number") continue;
        quotas[model] = {
          remaining: remainingFraction,
          resetTime: toTimestamp(raw["resetTime"]),
          modelCount: typeof raw["modelCount"] === "number" ? (raw["modelCount"] as number) : undefined,
        };
      }
    }
  }

  return quotas;
}

function mapAccount(account: Record<string, unknown>, provider: string, now: number): AccountSummary {
  const rateLimits: Record<string, RateLimitInfo> = {};
  const rateLimitResetTimes = isRecord(account["rateLimitResetTimes"]) ? account["rateLimitResetTimes"] : {};
  for (const [key, value] of Object.entries(rateLimitResetTimes)) {
    if (typeof value !== "number") continue;
    rateLimits[key] = { resetTime: value, isLimited: value > now };
  }

  const meta = isRecord(account["meta"]) ? account["meta"] : null;
  const cachedQuota = isRecord(account["cachedQuota"]) ? account["cachedQuota"] : null;
  const quotaUpdatedAt =
    (typeof meta?.["cachedQuotaUpdatedAt"] === "number" ? meta["cachedQuotaUpdatedAt"] : undefined) ??
    (typeof cachedQuota?.["at"] === "number" ? cachedQuota["at"] : undefined) ??
    (typeof account["cachedQuotaUpdatedAt"] === "number" ? (account["cachedQuotaUpdatedAt"] as number) : undefined) ??
    0;

  const email = account["email"] ?? account["username"] ?? account["id"] ?? provider;

  return {
    email: typeof email === "string" ? email : provider,
    enabled: account["enabled"] !== false,
    lastUsed: (typeof account["lastUsed"] === "number" ? account["lastUsed"] : undefined) ?? (typeof account["updatedAt"] === "number" ? account["updatedAt"] : undefined) ?? 0,
    rateLimits,
    quotas: normalizeQuotas(account),
    quotaUpdatedAt,
    provider,
  };
}

interface AccountsStore {
  providers?: Record<string, { accounts?: Record<string, unknown>[] }>;
}

export function getAccountsData(): AccountSummary[] {
  const now = Date.now();
  const store = readJSON<AccountsStore>(join(configFolder(), "accounts.json"));
  const accounts: AccountSummary[] = [];
  if (store?.providers) {
    for (const [provider, pool] of Object.entries(store.providers)) {
      for (const account of pool.accounts ?? []) accounts.push(mapAccount(account, provider, now));
    }
  }
  return accounts;
}

export async function buildSnapshot(): Promise<UsageSnapshotData> {
  const accounts = getAccountsData();
  const sessions = await buildSessionsWithCosts();
  const models = buildModelSummary(sessions);

  const costByDay: Record<string, DayUsage> = {};
  for (const session of sessions) {
    for (const [day, usage] of Object.entries(session.costByDay)) {
      const entry = costByDay[day] ?? (costByDay[day] = { tokens: 0, tokensInput: 0, tokensOutput: 0, tokensReasoning: 0, messageCount: 0 });
      entry.tokens += usage.tokens;
      entry.tokensInput += usage.tokensInput;
      entry.tokensOutput += usage.tokensOutput;
      entry.tokensReasoning += usage.tokensReasoning;
      entry.messageCount += usage.messageCount;
    }
  }

  return {
    updatedAt: Date.now(),
    accounts,
    sessions: sessions.slice(0, 50),
    models,
    costByDay,
  };
}
