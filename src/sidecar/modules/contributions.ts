import type { PluginConfigSchema, PluginHome, PluginScreen, PluginSettingsSection, Result } from "../../../packages/shared/src/domain.js";
import { pluginHomes } from "../lib/pluginHomes.js";
import { readCache, writeCache } from "../lib/cache.js";
import { getConfigDir } from "@core-auth/index.js";
import { configSchemas } from "./appConfig.js";
import { wrap } from "../result.js";

export const CONTRIBUTIONS_NS = "contributions";
const CONTRIBUTIONS_KEY = "contributions";

export interface Contributions {
  screens: PluginScreen[];
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

const EMPTY: Contributions = { screens: [], sections: [] };

async function realSchemas(homeId: string): Promise<PluginConfigSchema[]> {
  const result = await configSchemas(homeId);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function byOrderThenLabel(a: { order?: number; label: string }, b: { order?: number; label: string }): number {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label);
}

// A plugin asks for UI of its own in its capability declaration: a screen (a nav entry plus
// a nested layout tree) and sections placed inside the dashboard's own settings screen. This
// collects both across every home the dashboard manages, so one pass over the declarations
// serves both.
// (Not to be confused with a MarketplaceContribution, which is a catalog entry a plugin
// publishes rather than a piece of the dashboard's own UI.)
// A home that cannot be read contributes nothing rather than sinking the whole list: one
// broken bundle must not cost the user every other plugin's contribution.
async function collect(deps: ContributionsDeps): Promise<Contributions> {
  const homes = deps.homes ?? (await pluginHomes());
  const schemas = deps.schemas ?? realSchemas;
  const screens = new Map<string, PluginScreen>();
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
      for (const spec of schema.screens ?? []) {
        const key = `${schema.plugin}:${spec.id}`;
        const existing = screens.get(key);
        if (existing) { existing.homes.push(home.id); continue; }
        screens.set(key, { ...spec, plugin: schema.plugin, homes: [home.id] });
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
    screens: [...screens.values()].sort(byOrderThenLabel),
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

// A cache written by a pre-upgrade build carries the old { menus, sections } shape. Trusting
// it as-is would hand a caller `screens: undefined`, so the shape is checked, not just presence.
function isContributions(value: unknown): value is Contributions {
  const v = value as Partial<Contributions> | null;
  return !!v && Array.isArray(v.screens) && Array.isArray(v.sections);
}

function read(opts: ContributionsOptions, deps: ContributionsDeps): Promise<Contributions> {
  const cacheDir = deps.cacheDir ?? getConfigDir();
  if (opts.wait) return refresh(deps, cacheDir);
  const cached = readCache<Contributions>(CONTRIBUTIONS_NS, CONTRIBUTIONS_KEY, cacheDir)?.value;
  return Promise.resolve(isContributions(cached) ? cached : EMPTY);
}

export function screensList(opts: ContributionsOptions = {}, deps: ContributionsDeps = {}): Promise<Result<PluginScreen[]>> {
  return wrap(async () => (await read(opts, deps)).screens);
}

export function settingsSections(opts: ContributionsOptions = {}, deps: ContributionsDeps = {}): Promise<Result<PluginSettingsSection[]>> {
  return wrap(async () => (await read(opts, deps)).sections);
}

export function resetContributionsForTests(): void {
  inFlight = null;
}
