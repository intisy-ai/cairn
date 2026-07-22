import { scanOrg } from "../lib/orgScan.js";
import type { OrgScanDeps } from "../lib/orgScan.js";
import type { CatalogResult, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

export function catalogList(deps: OrgScanDeps = {}): Promise<Result<CatalogResult>> {
  return wrap(() => scanOrg(deps));
}
