import { existsSync } from "node:fs";
import { getAppConfigDir } from "@plugin-updater/env.js";
import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir } from "@core-auth/index.js";
import { getConfigValue, setConfigValue } from "@core/index.js";
import type { ImportableApp, ImportSummary, Result } from "../../../packages/shared/src/domain.js";
import { appsDetect } from "./apps.js";
import { wrap } from "../result.js";

type AppName = "claude" | "opencode";
const LABELS: Record<AppName, string> = { claude: "Claude Code", opencode: "OpenCode" };
const EXPOSURE_CONFIG_NAME = "dashboard-exposure";
const EXPOSURE_CONFIG_KEY = "map";

export async function importApps(): Promise<Result<ImportableApp[]>> {
  return wrap(async () => {
    const detected = await appsDetect();
    const present = detected.ok ? detected.data : { claude: false, opencode: false };
    return (["claude", "opencode"] as AppName[])
      .filter((a) => present[a])
      .map((a) => ({ app: a, label: LABELS[a], hasConfig: existsSync(getAppConfigDir(a)) }));
  });
}

export async function importRun(app: string): Promise<Result<ImportSummary>> {
  return wrap(async () => {
    const notes: string[] = [];
    if (app !== "claude" && app !== "opencode") throw new Error(`unknown app: ${app}`);
    const cfg = getAppConfigDir(app as AppName);
    if (!existsSync(cfg)) throw new Error(`no config found for ${app} at ${cfg}`);

    const providers = readDeployedProviders(reposDir());
    const exposureKey = app === "claude" ? "cc" : "oc";
    const map = (getConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY) as Record<string, { cc: boolean; oc: boolean }> | undefined) ?? {};
    for (const p of providers) {
      const cur = map[p.provider] ?? { cc: true, oc: true };
      map[p.provider] = { ...cur, [exposureKey]: true };
    }
    setConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY, map);

    notes.push(`exposed ${providers.length} provider(s) for ${LABELS[app as AppName]}`);

    return { accounts: 0, providers: providers.length, routingImported: false, notes };
  });
}
