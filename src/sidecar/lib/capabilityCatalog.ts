import { catalogFor, queryCapability } from "@core-loader/capability-catalog.js";
import type { CatalogDeps, CatalogEntry } from "@core-loader/capability-catalog.js";
import { readMarketplaceSources, builtInSource } from "@core-loader/catalog-sources.js";
import type { MarketplaceSource } from "@core-loader/catalog-sources.js";
import { pathsForHome } from "./storagePaths.js";

export type { CatalogEntry };

/** How long a home's fetched catalog stands before it is read again. */
export const CATALOG_WINDOW_MS = 3_600_000;

// core-loader's own homePaths derives its subdirectory names from the ACTIVE home's environment
// overrides, which is wrong for a dashboard reading three foreign homes at once. pathsForHome looks
// the owning app up from the directory instead, so each home answers with its own names.
function pathsOf(homeDir: string) {
  const paths = pathsForHome(homeDir);
  return {
    configDir: homeDir,
    reposDir: paths.repos,
    pluginDir: paths.plugin,
    cacheDir: paths.cache,
    configFolder: paths.config,
  };
}

function sourcesOf(homeDir: string): MarketplaceSource[] {
  try {
    const declared = readMarketplaceSources(pathsOf(homeDir));
    return declared.length > 0 ? declared : [builtInSource()];
  } catch {
    return [builtInSource()];
  }
}

/** Every repository the home's declared marketplace sources offer, from its cache while fresh. */
export async function catalogEntriesFor(homeDir: string, deps: CatalogDeps = {}): Promise<CatalogEntry[]> {
  try {
    return await catalogFor(sourcesOf(homeDir), pathsOf(homeDir), CATALOG_WINDOW_MS, deps);
  } catch {
    return [];
  }
}

/**
 * The repository to install when a home needs a capability it has not got.
 *
 * @remarks
 * The answer comes from each candidate's own `plugin.json`, never from a GitHub topic: repo-meta
 * assigns exactly one category topic per repository, so a repository that is both a provider and a
 * proxy cannot be described by topics at all.
 */
export async function repoProvidingCapability(
  homeDir: string,
  capabilityId: string,
  deps: CatalogDeps = {},
): Promise<CatalogEntry | null> {
  try {
    const found = await queryCapability(capabilityId, sourcesOf(homeDir), pathsOf(homeDir), CATALOG_WINDOW_MS, deps);
    return found[0] ?? null;
  } catch {
    return null;
  }
}
