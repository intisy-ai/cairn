import type { HomePlugins, CatalogEntry, PluginHome, UnifiedPlugin, CatalogKind } from "@cairn/shared";
import { classifyRepoName } from "@cairn/shared";

function kindOf(name: string, catalog: CatalogEntry[]): CatalogKind {
  const hit = catalog.find((e) => e.name === name);
  if (hit) return hit.kind;
  return classifyRepoName(name) ?? "plugin";
}

export function applicableHomeIds(kind: CatalogKind, homes: PluginHome[]): string[] {
  return homes
    .filter((h) => (h.id === "cairn" ? kind !== "plugin" && kind !== "loader" : kind !== "proxy"))
    .map((h) => h.id);
}

// GitHub owner of a repo URL (or owner/repo shorthand); null if it isn't one.
export function repoOwner(url: string): string | null {
  const cleaned = url.trim().replace(/\.git$/, "");
  const full = cleaned.match(/github\.com[/:]([^/]+)\//);
  if (full) return full[1];
  const short = cleaned.match(/^([^/\s]+)\/[^/\s]+$/);
  return short ? short[1] : null;
}

export function buildUnifiedPlugins(
  sections: HomePlugins[],
  catalog: CatalogEntry[],
  homes: PluginHome[],
  engines: { name: string; url: string }[] = [],
  marketplaceOrg = "",
): UnifiedPlugin[] {
  const engineUrls = new Map(engines.map((e) => [e.name, e.url]));
  const names = new Set<string>();
  for (const s of sections) for (const r of s.rows) names.add(r.name);
  for (const e of catalog) names.add(e.name);
  // Engines are always offered even when the catalog (org scan) omits them, e.g.
  // plugin-updater lives in a tool repo the catalog filters out.
  for (const e of engines) names.add(e.name);

  const out: UnifiedPlugin[] = [];
  for (const name of names) {
    const kind = kindOf(name, catalog);
    const catEntry = catalog.find((e) => e.name === name);
    const engineUrl = engineUrls.get(name);
    // Engines are Cairn-installable into every home (bootstrap) and carry their
    // clone URL from the engine registry when the catalog has none.
    const homeIds = engineUrl !== undefined ? homes.map((h) => h.id) : applicableHomeIds(kind, homes);
    const rows = sections.flatMap((s) => s.rows.filter((r) => r.name === name).map((r) => ({ home: s.home.id, r })));
    const installedDesc = rows.map((x) => x.r.description).find((d) => d && d.length > 0) ?? "";
    const installedName = rows.map((x) => x.r.displayName).find((d) => d && d.length > 0);
    const installedIcon = rows.map((x) => x.r.icon).find((i) => i && i.length > 0);
    const installedUrl = rows.map((x) => x.r.url).find((u) => u && u.length > 0);
    const url = catEntry?.url ?? engineUrl ?? installedUrl;
    // Catalog and engine repos are the trusted org; a plugin is external only when
    // its own repo owner differs from the configured marketplace org.
    const owner = url ? repoOwner(url) : null;
    const external = !!marketplaceOrg && !!owner && owner !== marketplaceOrg;
    const homesMap: UnifiedPlugin["homes"] = {};
    for (const id of homeIds) {
      const hit = rows.find((x) => x.home === id);
      homesMap[id] = { installed: !!hit, version: hit?.r.installedVersion };
    }
    out.push({
      name,
      kind,
      description: installedDesc || (catEntry?.description ?? ""),
      url,
      updateAvailable: rows.some((x) => x.r.updateAvailable),
      homes: homesMap,
      topics: catEntry?.topics ?? [],
      displayName: installedName || catEntry?.displayName || name,
      icon: installedIcon || catEntry?.icon || "",
      external,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
