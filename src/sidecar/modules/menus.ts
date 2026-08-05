import type { PluginConfigSchema, PluginHome, PluginMenu, Result } from "../../../packages/shared/src/domain.js";
import { pluginHomes } from "../lib/pluginHomes.js";
import { readCache, writeCache } from "../lib/cache.js";
import { getConfigDir } from "@core-auth/index.js";
import { configSchemas } from "./appConfig.js";
import { wrap } from "../result.js";

export const MENUS_NS = "menus";
const MENUS_KEY = "menus";

export interface MenusDeps {
  homes?: PluginHome[];
  schemas?: (homeId: string) => Promise<PluginConfigSchema[]>;
  cacheDir?: string;
}

export interface MenusOptions {
  // Collecting menus means resolving every home's plugin declarations, which on a cold
  // cache costs real time. The sidebar therefore paints from the last known set and asks
  // for a refresh separately, so a first paint never waits on it.
  wait?: boolean;
}

async function realSchemas(homeId: string): Promise<PluginConfigSchema[]> {
  const result = await configSchemas(homeId);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

// A plugin asks for a menu of its own in its capability declaration; this collects those
// requests across every home the dashboard manages so the sidebar renders them as data.
// A home that cannot be read contributes nothing rather than sinking the whole list: one
// broken bundle must not cost the user every other plugin's menu.
async function collect(deps: MenusDeps): Promise<PluginMenu[]> {
  const homes = deps.homes ?? (await pluginHomes());
  const schemas = deps.schemas ?? realSchemas;
  const byPlugin = new Map<string, PluginMenu>();
  for (const home of homes) {
    if (home.id !== "cairn" && !home.present) continue;
    let found: PluginConfigSchema[];
    try {
      found = await schemas(home.id);
    } catch {
      continue;
    }
    for (const schema of found) {
      if (!schema.menu) continue;
      const existing = byPlugin.get(schema.plugin);
      if (existing) {
        existing.homes.push(home.id);
        continue;
      }
      byPlugin.set(schema.plugin, {
        plugin: schema.plugin,
        label: schema.menu.label,
        ...(schema.menu.glyph ? { glyph: schema.menu.glyph } : {}),
        ...(typeof schema.menu.order === "number" ? { order: schema.menu.order } : {}),
        homes: [home.id],
      });
    }
  }
  return [...byPlugin.values()].sort(
    (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label),
  );
}

// Two callers arriving together (the sidebar remounting, a second window) share one pass.
let inFlight: Promise<PluginMenu[]> | null = null;

function refresh(deps: MenusDeps, cacheDir: string): Promise<PluginMenu[]> {
  if (inFlight) return inFlight;
  inFlight = collect(deps)
    .then((menus) => {
      writeCache(MENUS_NS, MENUS_KEY, menus, cacheDir);
      return menus;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function menusList(opts: MenusOptions = {}, deps: MenusDeps = {}): Promise<Result<PluginMenu[]>> {
  return wrap(async () => {
    const cacheDir = deps.cacheDir ?? getConfigDir();
    if (opts.wait) return refresh(deps, cacheDir);
    return readCache<PluginMenu[]>(MENUS_NS, MENUS_KEY, cacheDir)?.value ?? [];
  });
}

export function resetMenusForTests(): void {
  inFlight = null;
}
