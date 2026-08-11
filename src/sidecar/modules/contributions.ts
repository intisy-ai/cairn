import type { PluginConfigSchema, PluginHome, PluginMenu, PluginSettingsSection, Result } from "../../../packages/shared/src/domain.js";
import { pluginHomes } from "../lib/pluginHomes.js";
import { readCache, writeCache } from "../lib/cache.js";
import { getConfigDir } from "@core-auth/index.js";
import { configSchemas } from "./appConfig.js";
import { wrap } from "../result.js";

export const CONTRIBUTIONS_NS = "contributions";
const CONTRIBUTIONS_KEY = "contributions";

export interface Contributions {
  menus: PluginMenu[];
  sections: PluginSettingsSection[];
}

export interface ContributionsDeps {
  homes?: PluginHome[];
  schemas?: (homeId: string) => Promise<PluginConfigSchema[]>;
  cacheDir?: string;
}

export interface ContributionsOptions {
  // Collecting contributions means resolving every home's plugin declarations, which on a
  // cold cache costs real time. A screen therefore paints from the last known set and asks
  // for a refresh separately, so a first paint never waits on it.
  wait?: boolean;
}

const EMPTY: Contributions = { menus: [], sections: [] };

async function realSchemas(homeId: string): Promise<PluginConfigSchema[]> {
  const result = await configSchemas(homeId);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function byOrderThenLabel(a: { order?: number; label: string }, b: { order?: number; label: string }): number {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label);
}

// A plugin asks for UI of its own in its capability declaration: a nav entry (menu) and
// sections placed inside the dashboard's own settings screen. This collects both across
// every home the dashboard manages, so one pass over the declarations serves both.
// A home that cannot be read contributes nothing rather than sinking the whole list: one
// broken bundle must not cost the user every other plugin's contribution.
async function collect(deps: ContributionsDeps): Promise<Contributions> {
  const homes = deps.homes ?? (await pluginHomes());
  const schemas = deps.schemas ?? realSchemas;
  const menus = new Map<string, PluginMenu>();
  const sections = new Map<string, PluginSettingsSection>();

  for (const home of homes) {
    if (home.id !== "cairn" && !home.present) continue;
    let found: PluginConfigSchema[];
    try {
      found = await schemas(home.id);
    } catch {
      continue;
    }
    for (const schema of found) {
      if (schema.menu) {
        const existing = menus.get(schema.plugin);
        if (existing) existing.homes.push(home.id);
        else menus.set(schema.plugin, { ...schema.menu, plugin: schema.plugin, homes: [home.id] });
      }
      for (const spec of schema.sections ?? []) {
        const key = `${schema.plugin}:${spec.id}`;
        const existing = sections.get(key);
        if (existing) { existing.homes.push(home.id); continue; }
        const { fields: _fields, actions: _actions, ...rest } = spec;
        sections.set(key, { ...rest, plugin: schema.plugin, homes: [home.id] });
      }
    }
  }

  return {
    menus: [...menus.values()].sort(byOrderThenLabel),
    sections: [...sections.values()].sort(byOrderThenLabel),
  };
}

// Two callers arriving together (the sidebar remounting, the settings screen) share one pass.
let inFlight: Promise<Contributions> | null = null;

function refresh(deps: ContributionsDeps, cacheDir: string): Promise<Contributions> {
  if (inFlight) return inFlight;
  inFlight = collect(deps)
    .then((contributions) => {
      writeCache(CONTRIBUTIONS_NS, CONTRIBUTIONS_KEY, contributions, cacheDir);
      return contributions;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

function read(opts: ContributionsOptions, deps: ContributionsDeps): Promise<Contributions> {
  const cacheDir = deps.cacheDir ?? getConfigDir();
  if (opts.wait) return refresh(deps, cacheDir);
  return Promise.resolve(readCache<Contributions>(CONTRIBUTIONS_NS, CONTRIBUTIONS_KEY, cacheDir)?.value ?? EMPTY);
}

export function menusList(opts: ContributionsOptions = {}, deps: ContributionsDeps = {}): Promise<Result<PluginMenu[]>> {
  return wrap(async () => (await read(opts, deps)).menus);
}

export function settingsSections(opts: ContributionsOptions = {}, deps: ContributionsDeps = {}): Promise<Result<PluginSettingsSection[]>> {
  return wrap(async () => (await read(opts, deps)).sections);
}

export function resetContributionsForTests(): void {
  inFlight = null;
}
