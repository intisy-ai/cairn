import { getEngines, engineByCapability } from "@core/index.js";
import type { EngineDescriptor } from "@core/index.js";
import type { Plugin } from "@plugin-updater/types.js";
import { pluginHomes } from "../lib/pluginHomes.js";
import { safeGetPlugins } from "../lib/optionalEngines.js";
import type { EngineView, EngineHomeState, PluginHome, Result, CliResult } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

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
  if (engine.capability === PLUGIN_MANAGEMENT) {
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
      getEngines().map(async (engine) => ({
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

export function ensureEngine(capability: string, deps: EnginesDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const engine = engineByCapability(capability);
    if (!engine) throw new Error(`unknown engine capability: ${capability}`);
    const homes = await resolveHomes(deps);
    const getPlugins = deps.getPlugins ?? safeGetPlugins;
    const home = targetHomes(engine, homes)[0];
    if (!home) throw new Error(`no target home for engine: ${engine.id}`);
    if ((await stateIn(engine, home, getPlugins)).installed) return;
    await installEngine(engine, home, deps);
  });
}
