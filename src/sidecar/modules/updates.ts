// Checking for and installing plugin updates on demand. The manager owns the policy and the lock;
// this only names the home the user pointed at, and resolves the manager from that home rather than
// naming one.
import type { PluginHome, PluginHomeId, Result } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeDir } from "../lib/pluginHomes.js";
import { invokePluginManagement, readPluginManagement } from "../lib/pluginManager.js";
import { wrap } from "../result.js";

export interface CheckSummary {
  checkedAt: string;
  available: string[];
}

/** What a manager answers with. Null means the home has nothing managing its plugins. */
type Outcome = { ok: boolean; message?: string } | null;
type Cache = { checkedAt: string; plugins: Record<string, { updateAvailable: boolean }> } | null;

/**
 * Stand-ins for the capability calls, injected at the boundary.
 *
 * @remarks
 * Each one replaces exactly the call into the plugin, never the handling around it, so a test
 * exercises the same derivation and the same failure mapping the real path does.
 */
export interface UpdatesDeps {
  homes?: () => Promise<PluginHome[]>;
  checkUpdates?: (dir: string, appId: string) => Promise<Cache>;
  updateOne?: (dir: string, name: string, appId: string) => Promise<Outcome>;
  updateAll?: (dir: string, appId: string) => Promise<Outcome>;
}

const NOTHING: CheckSummary = { checkedAt: "", available: [] };

async function dirFor(homeId: string, deps: UpdatesDeps): Promise<string> {
  const homes = await (deps.homes ?? pluginHomes)();
  return homeDir(homeId as PluginHomeId, homes);
}

// Which plugins an update is available for, read off the cache the check just wrote rather than
// asked for separately: the flag per plugin IS the answer, and a second call could disagree with
// the first.
export function availableIn(cache: Cache): CheckSummary {
  if (!cache) return NOTHING;
  return {
    checkedAt: cache.checkedAt,
    available: Object.keys(cache.plugins ?? {}).filter((name) => cache.plugins[name]?.updateAvailable),
  };
}

export function updatesCheck(homeId: string, deps: UpdatesDeps = {}): Promise<Result<CheckSummary>> {
  return wrap(async () => {
    const dir = await dirFor(homeId, deps);
    const check = deps.checkUpdates ?? ((home: string, appId: string) =>
      readPluginManagement(home, appId, "checkUpdates", null as Cache, (capability) => capability.checkUpdates()));
    return availableIn(await check(dir, homeId));
  });
}

// A refused update is an error the caller shows, not a value it inspects: the manager answers with
// one line saying what happened, and this envelope already carries a failure.
function applied(homeId: string, outcome: Outcome): void {
  if (!outcome) throw new Error(`nothing manages the plugins of ${homeId}`);
  if (!outcome.ok) throw new Error(outcome.message ?? "the update was refused");
}

export function updatesOne(homeId: string, name: string, deps: UpdatesDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const dir = await dirFor(homeId, deps);
    const update = deps.updateOne ?? ((home: string, plugin: string, appId: string) =>
      invokePluginManagement(home, appId, "update", null as Outcome, (capability) => capability.update(plugin)));
    applied(homeId, await update(dir, name, homeId));
  });
}

export function updatesAll(homeId: string, deps: UpdatesDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const dir = await dirFor(homeId, deps);
    const update = deps.updateAll ?? ((home: string, appId: string) =>
      invokePluginManagement(home, appId, "updateAll", null as Outcome, (capability) => capability.updateAll()));
    applied(homeId, await update(dir, homeId));
  });
}
