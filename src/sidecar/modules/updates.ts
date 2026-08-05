// Checking for and installing plugin updates on demand. The engine owns the policy and
// the lock; this only names the home the user pointed at, and reuses the same serialized
// withHome seam every other in-process engine call goes through.
import type { PluginHome, PluginHomeId, Result } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeDir } from "../lib/pluginHomes.js";
import { loadPluginUpdaterIndex } from "../lib/optionalEngines.js";
import { requirePluginUpdater, withHome } from "./plugins.js";
import { wrap } from "../result.js";

export interface CheckSummary {
  checkedAt: string;
  available: string[];
}

export interface UpdateSummary {
  updated: string[];
  skipped: string[];
  failed: string[];
  checkedAt: string;
}

export interface UpdatesDeps {
  homes?: () => Promise<PluginHome[]>;
  checkUpdates?: (dir: string) => Promise<CheckSummary>;
  updateOne?: (dir: string, name: string) => Promise<UpdateSummary>;
  updateAll?: (dir: string) => Promise<UpdateSummary>;
}

async function dirFor(homeId: string, deps: UpdatesDeps): Promise<string> {
  const homes = await (deps.homes ?? pluginHomes)();
  return homeDir(homeId as PluginHomeId, homes);
}

export function updatesCheck(homeId: string, deps: UpdatesDeps = {}): Promise<Result<CheckSummary>> {
  return wrap(async () => {
    const dir = await dirFor(homeId, deps);
    const check = deps.checkUpdates ?? requirePluginUpdater(await loadPluginUpdaterIndex()).checkUpdates;
    const result = await withHome(dir, () => check(dir), homeId);
    return { checkedAt: result.checkedAt, available: result.available };
  });
}

export function updatesOne(homeId: string, name: string, deps: UpdatesDeps = {}): Promise<Result<UpdateSummary>> {
  return wrap(async () => {
    const dir = await dirFor(homeId, deps);
    const update = deps.updateOne ?? requirePluginUpdater(await loadPluginUpdaterIndex()).updateOne;
    return withHome(dir, () => update(dir, name), homeId);
  });
}

export function updatesAll(homeId: string, deps: UpdatesDeps = {}): Promise<Result<UpdateSummary>> {
  return wrap(async () => {
    const dir = await dirFor(homeId, deps);
    const update = deps.updateAll ?? requirePluginUpdater(await loadPluginUpdaterIndex()).updateAll;
    return withHome(dir, () => update(dir), homeId);
  });
}
