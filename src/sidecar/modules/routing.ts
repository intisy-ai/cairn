import { getConfigDir } from "@core-auth/index.js";
import { resolveModelMap, claudeTiers, catalogEntries, normalizeChain } from "@core-proxy/model-map.js";
import { anthropicProfile } from "@claude-code-proxy/index.js";
import type { Chain } from "@core-proxy/index.js";
import type { RoutingState, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";
import { modelMapWrite } from "../lib/modelMapWrite.js";

function sanitizeChain(raw: unknown): Chain {
  return normalizeChain(raw).map(({ provider, model }) => ({ provider, model }));
}

export function routingGet(): Promise<Result<RoutingState>> {
  return wrap(() => {
    const configDir = getConfigDir();
    const profile = anthropicProfile();
    return {
      tiers: claudeTiers(configDir, profile),
      map: resolveModelMap(configDir, profile),
      catalog: catalogEntries(configDir),
    };
  });
}

export function routingSetChain(slot: string, chain: unknown): Promise<Result<void>> {
  return wrap(() => {
    modelMapWrite(getConfigDir(), anthropicProfile(), slot, sanitizeChain(chain));
  });
}
