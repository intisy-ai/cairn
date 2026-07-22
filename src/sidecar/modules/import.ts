import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { addAccount, getConfigDir, listAccounts, reposDir } from "@core-auth/index.js";
import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { resolveModelMap } from "@core-proxy/model-map.js";
import { getConfigValue, setConfigValue } from "@core/index.js";
import type { ImportableApp, ImportSummary, Result } from "../../../packages/shared/src/domain.js";
import { profileFor } from "../lib/proxyRegistry.js";
import { modelMapWrite } from "../lib/modelMapWrite.js";
import { appsDetect } from "./apps.js";
import { wrap } from "../result.js";

type AppName = "claude" | "opencode";
const LABELS: Record<AppName, string> = { claude: "Claude Code", opencode: "OpenCode" };
const EXPOSURE_CONFIG_NAME = "dashboard-exposure";
const EXPOSURE_CONFIG_KEY = "map";

function isAppName(x: string): x is AppName {
  return x === "claude" || x === "opencode";
}

// Mirrors libs/core-auth/src/env.ts's getConfigDir, resolving the app's REAL home
// independent of HUB_CONFIG_DIR (which the dashboard sidecar sets to its own store).
function appRealHome(app: string): string {
  const home = homedir();
  if (app === "claude") {
    return existsSync(join(home, ".claude")) ? join(home, ".claude") : join(home, ".config", "claude");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.trim()) return join(xdg.trim(), "opencode");
  return existsSync(join(home, ".config", "opencode")) ? join(home, ".config", "opencode") : join(home, ".opencode");
}

export interface ImportDeps {
  appHome?: (app: string) => string;
}

export async function importApps(deps: ImportDeps = {}): Promise<Result<ImportableApp[]>> {
  const appHome = deps.appHome ?? appRealHome;
  return wrap(async () => {
    const detected = await appsDetect();
    const present = detected.ok ? detected.data : { claude: false, opencode: false };
    return (["claude", "opencode"] as AppName[])
      .filter((a) => present[a])
      .map((a) => ({ app: a, label: LABELS[a], hasConfig: existsSync(appHome(a)) }));
  });
}

export async function importRun(app: string, deps: ImportDeps = {}): Promise<Result<ImportSummary>> {
  const appHome = deps.appHome ?? appRealHome;
  return wrap(async () => {
    if (!isAppName(app)) throw new Error(`unknown app: ${app}`);
    const notes: string[] = [];
    const home = appHome(app);
    if (!existsSync(home)) throw new Error(`no config found for ${app} at ${home}`);

    const providers = readDeployedProviders(reposDir());
    const accountsOpts = { dir: join(home, "config") };
    let accounts = 0;
    for (const p of providers) {
      const imported = listAccounts(p.provider, accountsOpts) as unknown[];
      for (const account of imported) addAccount(p.provider, account, undefined);
      accounts += imported.length;
    }
    notes.push(accounts > 0 ? `imported ${accounts} account(s)` : "no accounts to import");

    let routingImported = false;
    const profile = profileFor(app);
    if (profile) {
      const map = resolveModelMap(home, profile);
      let tiersWritten = 0;
      for (const slot of Object.keys(map)) {
        const chain = map[slot];
        if (!chain.length) continue;
        modelMapWrite(getConfigDir(), profile, slot, chain.map(({ provider, model }) => ({ provider, model })));
        tiersWritten++;
      }
      routingImported = tiersWritten > 0;
      notes.push(routingImported ? `imported routing for ${tiersWritten} tier(s)` : "no routing to import");
    } else {
      notes.push(`no routing available for ${LABELS[app]}`);
    }

    const exposureKey = app === "claude" ? "cc" : "oc";
    const exposureMap =
      (getConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY) as Record<string, { cc: boolean; oc: boolean }> | undefined) ?? {};
    for (const p of providers) {
      const cur = exposureMap[p.provider] ?? { cc: true, oc: true };
      exposureMap[p.provider] = { ...cur, [exposureKey]: true };
    }
    setConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY, exposureMap);
    notes.push(`exposed ${providers.length} provider(s) for ${LABELS[app]}`);

    return { accounts, providers: providers.length, routingImported, notes };
  });
}
