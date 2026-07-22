import { getConfigDir, reposDir } from "@core-auth/index.js";
import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { resolveModelMap, claudeTiers, catalogEntries, normalizeChain } from "@core-proxy/model-map.js";
import type { Chain } from "@core-proxy/index.js";
import type { RoutingState, Result } from "../../../packages/shared/src/domain.js";
import type { RoutingApp } from "../lib/proxyRegistry.js";
import { availableRoutingApps, profileFor } from "../lib/proxyRegistry.js";
import { appsDetect } from "./apps.js";
import { wrap, err } from "../result.js";
import { modelMapWrite } from "../lib/modelMapWrite.js";

function sanitizeChain(raw: unknown): Chain {
  return normalizeChain(raw).map(({ provider, model }) => ({ provider, model }));
}

async function presentApps(): Promise<{ claude: boolean; opencode: boolean }> {
  const detected = await appsDetect();
  return detected.ok ? detected.data : { claude: false, opencode: false };
}

export async function routingApps(): Promise<Result<RoutingApp[]>> {
  return wrap(async () => availableRoutingApps(await presentApps()));
}

export async function routingGet(app: string): Promise<Result<RoutingState>> {
  const profile = profileFor(app);
  if (!profile) return err(`no routing available for app: ${app}`);
  return wrap(() => {
    const configDir = getConfigDir();
    return {
      tiers: claudeTiers(configDir, profile),
      map: resolveModelMap(configDir, profile),
      catalog: catalogEntries(configDir),
    };
  });
}

export async function routingSetChain(app: string, slot: string, chain: unknown): Promise<Result<{ warnings: string[] }>> {
  const profile = profileFor(app);
  if (!profile) return err(`no routing available for app: ${app}`);
  return wrap(() => {
    const known = new Set(readDeployedProviders(reposDir()).map((p) => p.provider));
    const sane = sanitizeChain(chain);
    const warnings: string[] = [];
    for (const entry of sane) {
      if (!known.has(entry.provider)) throw new Error(`unknown provider: ${entry.provider}`);
    }
    modelMapWrite(getConfigDir(), profile, slot, sane);
    return { warnings };
  });
}
