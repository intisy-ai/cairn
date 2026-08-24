import { setConfigValue } from "@intisy-ai/core";
import { resolveSources, parseSources } from "../lib/marketplaces.js";
import type { MarketplaceSource, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

const CONFIG_NAME = "marketplaces";

export interface MarketplaceSourcesDeps {
  save?: (sources: MarketplaceSource[]) => void;
}

export function marketplaceSourcesList(): Promise<Result<MarketplaceSource[]>> {
  return wrap(async () => resolveSources());
}

// Saves the whole list rather than one source at a time, because ORDER is priority: adding,
// removing, disabling and reordering are all the same edit to the same array, and a per-source
// call would need a second one to express where it sits.
export function marketplaceSourcesSave(sources: unknown, deps: MarketplaceSourcesDeps = {}): Promise<Result<MarketplaceSource[]>> {
  return wrap(async () => {
    if (!Array.isArray(sources)) throw new Error("marketplace sources must be a list");
    const valid = parseSources(sources);
    const ids = new Set<string>();
    for (const source of valid) {
      if (ids.has(source.id)) throw new Error(`two marketplaces share the id: ${source.id}`);
      ids.add(source.id);
    }
    const save = deps.save ?? ((value: MarketplaceSource[]) => setConfigValue(CONFIG_NAME, "sources", value));
    save(valid);
    return valid;
  });
}
