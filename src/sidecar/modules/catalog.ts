import { scanOrg } from "../lib/orgScan.js";
import type { OrgScanDeps } from "../lib/orgScan.js";
import type { CatalogResult, Result } from "../../../packages/shared/src/domain.js";
import { readCache, writeCache } from "../lib/cache.js";
import { getConfigDir } from "@core-auth/index.js";
import { wrap } from "../result.js";

const CATALOG_NS = "catalog";
const CATALOG_KEY = "org";

export function catalogList(deps: OrgScanDeps = {}, cacheDir: string = getConfigDir()): Promise<Result<CatalogResult>> {
  return wrap(async () => {
    const result = await scanOrg(deps);
    // A rate-limited scan returns an empty catalog; caching it would blank the next paint.
    if (result.entries.length > 0) writeCache(CATALOG_NS, CATALOG_KEY, result, cacheDir);
    return result;
  });
}

// The last catalog a scan produced. The plugin screen paints its whole row set from this plus
// the cached plugin list, so the first frame is the finished list rather than a subset that
// grows and reorders as each read lands.
export function catalogListCached(cacheDir: string = getConfigDir()): Promise<Result<CatalogResult | null>> {
  return wrap(async () => readCache<CatalogResult>(CATALOG_NS, CATALOG_KEY, cacheDir)?.value ?? null);
}
