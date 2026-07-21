import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir, listAccounts } from "@core-auth/index.js";
import type { OverviewSummary, Result } from "../../../packages/shared/src/domain.js";
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

export function overviewSummary(probe: () => Promise<boolean> = defaultProbe): Promise<Result<OverviewSummary>> {
  return wrap(async () => {
    const providers = readDeployedProviders(reposDir());
    const accountsTotal = providers.reduce((sum, provider) => sum + listAccounts(provider.provider, undefined).length, 0);
    const serverRunning = await probe();
    return { providersConnected: providers.length, accountsTotal, serverRunning, serverPort: SERVER_PORT };
  });
}
