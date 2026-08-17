import { pluginHomes, homeById } from "../lib/pluginHomes.js";
import { capabilityProviders, callHostCapability, DEFAULT_CALL_TIMEOUT_MS } from "../lib/pluginHost.js";
import type { HistoryEntryView, PluginHome, PluginHomeId, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

export type { HistoryEntryView };

interface ConfigHistoryLike {
  history: (query?: { home?: string; limit?: number; cursor?: string }) => Promise<Array<{ id: string; ts: number; summary: string; files: string[] }>>;
}

export interface ConfigHistoryDeps {
  homes?: PluginHome[];
  limit?: number;
}

/**
 * The configuration snapshots recorded for one home.
 *
 * @remarks
 * A home whose provider cannot answer is an empty history rather than a failure, because a surface
 * reading several homes must still render the others. The plugin is not named anywhere: whichever
 * plugin declares `config-history` in that home answers.
 */
export function configHistoryList(homeId: string, deps: ConfigHistoryDeps = {}): Promise<Result<HistoryEntryView[]>> {
  return wrap(async () => {
    const homes = deps.homes ?? (await pluginHomes());
    const home = homeById(homeId as PluginHomeId, homes);
    const out: HistoryEntryView[] = [];
    for (const record of await capabilityProviders(home.dir, home.id, "config-history")) {
      const capability = record.implementation as ConfigHistoryLike;
      if (typeof capability?.history !== "function") continue;
      const answer = await callHostCapability(record.pluginId, "config-history.history", DEFAULT_CALL_TIMEOUT_MS, async () =>
        capability.history({ home: home.dir, limit: deps.limit }));
      if (answer.ok === false) continue;
      for (const entry of Array.isArray(answer.value) ? answer.value : []) {
        out.push({ ...entry, plugin: record.pluginId });
      }
    }
    return out;
  });
}
