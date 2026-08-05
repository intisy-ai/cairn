import { getEngines } from "@core/index.js";
import type { EngineDescriptor } from "@core/index.js";
import type { Plugin } from "@plugin-updater/types.js";
import { pluginHomes, homeById } from "../lib/pluginHomes.js";
import { safeGetPlugins } from "../lib/optionalEngines.js";
import { CAIRN_ENGINES } from "./engines.data.js";
import type { EngineView, EngineHomeState, PluginHome, PluginHomeId, Result, CliResult } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

// core's BUILTIN_ENGINES holds only generic, ecosystem-wide engines. Cairn
// supplements it with engines that back Cairn's own features (e.g. the
// custom-auth provider backing custom endpoints); see engines.data.ts.
function allEngines(): EngineDescriptor[] {
  return [...getEngines(), ...CAIRN_ENGINES];
}

export function engineByCapability(capability: string): EngineDescriptor | undefined {
  return allEngines().find((e) => e.capability === capability);
}

export interface EnginesDeps {
  homes?: PluginHome[];
  getPlugins?: (dir: string) => Plugin[] | Promise<Plugin[]>;
  appsInit?: (app: string) => Promise<Result<CliResult>>;
  pluginsInstall?: (homeId: string, name: string, url: string) => Promise<Result<void>>;
}

const PLUGIN_MANAGEMENT = "plugin-management";

function targetHomes(engine: EngineDescriptor, homes: PluginHome[]): PluginHome[] {
  return engine.target === "cairn" ? homes.filter((h) => h.id === "cairn") : homes.filter((h) => h.id !== "cairn");
}

async function stateIn(engine: EngineDescriptor, home: PluginHome, getPlugins: (dir: string) => Plugin[] | Promise<Plugin[]>): Promise<EngineHomeState> {
  if (engine.capability === PLUGIN_MANAGEMENT) return { installed: home.hasUpdater, enabled: true };
  const p = (await getPlugins(home.dir)).find((x) => x.name === engine.id);
  return { installed: !!p, enabled: p ? p.enabled !== false : false };
}

async function resolveHomes(deps: EnginesDeps): Promise<PluginHome[]> {
  return deps.homes ?? (await pluginHomes());
}

async function installEngine(engine: EngineDescriptor, home: PluginHome, deps: EnginesDeps): Promise<void> {
  // An app home registers the plugin manager through its own CLI. Cairn's home has no CLI,
  // so the bundled copy clones it in place like any other engine.
  if (engine.capability === PLUGIN_MANAGEMENT && home.id !== "cairn") {
    const appsInit = deps.appsInit ?? (await import("./apps.js")).appsInit;
    const res = await appsInit(home.id);
    if (!res.ok) throw new Error(res.error);
    return;
  }
  const install = deps.pluginsInstall ?? (await import("./plugins.js")).pluginsInstall;
  const res = await install(home.id, engine.id, engine.url);
  if (!res.ok) throw new Error(res.error);
}

export function enginesList(deps: EnginesDeps = {}): Promise<Result<EngineView[]>> {
  return wrap(async () => {
    const homes = await resolveHomes(deps);
    const getPlugins = deps.getPlugins ?? safeGetPlugins;
    return Promise.all(
      allEngines().map(async (engine) => ({
        id: engine.id,
        capability: engine.capability,
        url: engine.url,
        homes: Object.fromEntries(
          await Promise.all(targetHomes(engine, homes).map(async (h) => [h.id, await stateIn(engine, h, getPlugins)] as const)),
        ),
      })),
    );
  });
}

// Install an engine into ONE named home. The home is resolved from every home Cairn
// manages, not from the engine's target list: a capability that normally belongs to the
// app homes is still needed in Cairn's own home once something there has to be managed.
export function ensureEngineIn(capability: string, homeId: string, deps: EnginesDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const engine = engineByCapability(capability);
    if (!engine) throw new Error(`unknown engine capability: ${capability}`);
    const homes = await resolveHomes(deps);
    const home = homeById(homeId as PluginHomeId, homes);
    const getPlugins = deps.getPlugins ?? safeGetPlugins;
    if ((await stateIn(engine, home, getPlugins)).installed) return;
    await installEngine(engine, home, deps);
  });
}

export function ensureEngine(capability: string, deps: EnginesDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const engine = engineByCapability(capability);
    if (!engine) throw new Error(`unknown engine capability: ${capability}`);
    const homes = await resolveHomes(deps);
    const home = targetHomes(engine, homes)[0];
    if (!home) throw new Error(`no target home for engine: ${engine.id}`);
    const result = await ensureEngineIn(capability, home.id, { ...deps, homes });
    if (!result.ok) throw new Error(result.error);
  });
}
