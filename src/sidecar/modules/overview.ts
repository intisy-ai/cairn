import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir } from "@core-auth/index.js";
import { getPlugins } from "@plugin-updater/config.js";
import { getAccountsData } from "../../../vendor/usage/snapshot.js";
import { pluginHomes } from "../lib/pluginHomes.js";
import { appsDetect } from "./apps.js";
import type { AccountSummary } from "../../../vendor/usage/types.js";
import type { OverviewSummary, ProviderHealth, PluginHome, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

const SERVER_PORT = 34567;
const PROBE_TIMEOUT_MS = 500;

async function defaultProbe(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${SERVER_PORT}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

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
  pluginsIn?: (dir: string) => unknown[];
  detect?: () => Promise<{ claude: boolean; opencode: boolean }>;
  providers?: () => { provider: string }[];
}

export function overviewSummary(deps: OverviewDeps = {}): Promise<Result<OverviewSummary>> {
  const probe = deps.probe ?? defaultProbe;
  const accountsOf = deps.accounts ?? getAccountsData;
  const homesOf = deps.homes ?? pluginHomes;
  const pluginsIn = deps.pluginsIn ?? getPlugins;
  const detect = deps.detect ?? (async () => {
    const result = await appsDetect();
    return result.ok ? result.data : { claude: false, opencode: false };
  });
  const providersOf = deps.providers ?? (() => readDeployedProviders(reposDir()));
  return wrap(async () => {
    const providers = providersOf();
    const accounts = accountsOf();
    const homes = await homesOf();
    const pluginsInstalled = homes.filter((h) => h.present).reduce((sum, h) => sum + pluginsIn(h.dir).length, 0);
    const presence = await detect();
    const serverRunning = await probe();
    return {
      providersConnected: providers.length,
      accountsTotal: accounts.length,
      accountsEnabled: accounts.filter((a) => a.enabled).length,
      appsDetected: [presence.claude, presence.opencode].filter(Boolean).length,
      pluginsInstalled,
      providerHealth: providerHealthOf(accounts),
      serverRunning,
      serverPort: SERVER_PORT,
    };
  });
}
