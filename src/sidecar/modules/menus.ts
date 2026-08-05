import type { PluginConfigSchema, PluginHome, PluginMenu, Result } from "../../../packages/shared/src/domain.js";
import { pluginHomes } from "../lib/pluginHomes.js";
import { configSchemas } from "./appConfig.js";
import { wrap } from "../result.js";

export interface MenusDeps {
  homes?: PluginHome[];
  schemas?: (homeId: string) => Promise<PluginConfigSchema[]>;
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
export function menusList(deps: MenusDeps = {}): Promise<Result<PluginMenu[]>> {
  return wrap(async () => {
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
  });
}
