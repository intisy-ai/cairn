import type { HomePlugins, CatalogEntry, PluginHome, UnifiedPlugin, CatalogKind } from "@cairn/shared";
import { classifyRepoName } from "@cairn/shared";

function kindOf(name: string, catalog: CatalogEntry[]): CatalogKind {
  const hit = catalog.find((e) => e.name === name);
  if (hit) return hit.kind;
  return classifyRepoName(name) ?? "plugin";
}

function applicableHomeIds(kind: CatalogKind, homes: PluginHome[]): string[] {
  return homes
    .filter((h) => (h.id === "cairn" ? kind !== "plugin" : kind !== "proxy"))
    .map((h) => h.id);
}

export function buildUnifiedPlugins(sections: HomePlugins[], catalog: CatalogEntry[], homes: PluginHome[]): UnifiedPlugin[] {
  const names = new Set<string>();
  for (const s of sections) for (const r of s.rows) names.add(r.name);
  for (const e of catalog) names.add(e.name);
  names.delete("plugin-updater");

  const out: UnifiedPlugin[] = [];
  for (const name of names) {
    const kind = kindOf(name, catalog);
    const catEntry = catalog.find((e) => e.name === name);
    const homeIds = applicableHomeIds(kind, homes);
    const rows = sections.flatMap((s) => s.rows.filter((r) => r.name === name).map((r) => ({ home: s.home.id, r })));
    const installedDesc = rows.map((x) => x.r.description).find((d) => d && d.length > 0) ?? "";
    const homesMap: UnifiedPlugin["homes"] = {};
    for (const id of homeIds) {
      const hit = rows.find((x) => x.home === id);
      homesMap[id] = { installed: !!hit, version: hit?.r.installedVersion };
    }
    out.push({
      name,
      kind,
      description: installedDesc || (catEntry?.description ?? ""),
      url: catEntry?.url,
      updateAvailable: rows.some((x) => x.r.updateAvailable),
      homes: homesMap,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
