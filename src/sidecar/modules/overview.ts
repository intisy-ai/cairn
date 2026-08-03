import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir } from "@core-auth/index.js";
import { getAccountsData } from "../../../vendor/usage/snapshot.js";
import { pluginHomes } from "../lib/pluginHomes.js";
import { safeGetPlugins } from "../lib/optionalEngines.js";
import { appsDetect } from "./apps.js";
import type { AccountSummary } from "../../../vendor/usage/types.js";
import type { AppPresence, OverviewSummary, ProviderHealth, PluginHome, Result } from "../../../packages/shared/src/domain.js";
import { probeProxyHealth } from "../../../packages/shared/src/proxy.js";
import { resolveLocalApiPort } from "../lib/localApiPort.js";
import { wrap } from "../result.js";

function firstQuotaPct(account: AccountSummary): number | null {
  const first = Object.values(account.quotas)[0];
  return first && typeof first.remaining === "number" ? Math.round(first.remaining * 100) : null;
}

function providerHealthOf(accounts: AccountSummary[]): ProviderHealth[] {
  const byProvider = new Map<string, { accounts: number; pcts: number[] }>();
  for (const account of accounts) {
    const entry = byProvider.get(account.provider) ?? { accounts: 0, pcts: [] };
    entry.accounts += 1;
    const pct = firstQuotaPct(account);
    if (pct !== null) entry.pcts.push(pct);
    byProvider.set(account.provider, entry);
  }
  return Array.from(byProvider.entries())
    .map(([provider, e]) => ({ provider, accounts: e.accounts, quotaMinPct: e.pcts.length ? Math.min(...e.pcts) : null }))
    .sort((a, b) => b.accounts - a.accounts);
}

export interface OverviewDeps {
  probe?: () => Promise<boolean>;
  accounts?: () => AccountSummary[];
  homes?: () => Promise<PluginHome[]>;
  pluginsIn?: (dir: string) => unknown[] | Promise<unknown[]>;
  detect?: () => Promise<AppPresence>;
  providers?: () => { provider: string }[];
}

export function overviewSummary(deps: OverviewDeps = {}): Promise<Result<OverviewSummary>> {
  const localApiPort = resolveLocalApiPort();
  const probe = deps.probe ?? (() => probeProxyHealth(localApiPort));
  const accountsOf = deps.accounts ?? getAccountsData;
  const homesOf = deps.homes ?? pluginHomes;
  const pluginsIn = deps.pluginsIn ?? safeGetPlugins;
  const detect = deps.detect ?? (async () => {
    const result = await appsDetect();
    return result.ok ? result.data : {};
  });
  const providersOf = deps.providers ?? (() => readDeployedProviders(reposDir()));
  return wrap(async () => {
    const providers = providersOf();
    const accounts = accountsOf();
    const homes = await homesOf();
    const pluginCounts = await Promise.all(homes.filter((h) => h.present).map((h) => pluginsIn(h.dir)));
    const pluginsInstalled = pluginCounts.reduce((sum, plugins) => sum + plugins.length, 0);
    const presence = await detect();
    const serverRunning = await probe();
    return {
      providersConnected: providers.length,
      accountsTotal: accounts.length,
      accountsEnabled: accounts.filter((a) => a.enabled).length,
      appsDetected: Object.values(presence).filter(Boolean).length,
      pluginsInstalled,
      providerHealth: providerHealthOf(accounts),
      serverRunning,
      serverPort: localApiPort,
    };
  });
}
