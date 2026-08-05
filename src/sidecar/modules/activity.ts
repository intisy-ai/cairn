import { readActivity, activityStats, type ActivityRecord, type ActivityQuery, type ActivityStats } from "@core/index.js";
import type { Result, PluginHome } from "../../../packages/shared/src/domain.js";
import { pluginHomes } from "../lib/pluginHomes.js";
import { wrap } from "../result.js";

export interface ActivityDeps {
  homes?: () => Promise<PluginHome[]>;
  read?: (homes: string[], q: ActivityQuery) => { records: ActivityRecord[]; nextCursor?: string };
}

// Direct, non-consuming read across every present home's activity log, filtered
// by the given query. Unlike busDrain this never advances a cursor, so it can be
// polled by the UI without competing with any other bus consumer.
export function activityRead(query: ActivityQuery, deps: ActivityDeps = {}): Promise<Result<{ records: ActivityRecord[]; nextCursor?: string }>> {
  const listHomes = deps.homes ?? pluginHomes;
  const read = deps.read ?? readActivity;
  return wrap(async () => {
    const dirs = (await listHomes()).filter((h) => h.present).map((h) => h.dir);
    return read(dirs, query);
  });
}

export interface ActivityStatsDeps {
  homes?: () => Promise<PluginHome[]>;
  stats?: (homes: string[]) => ActivityStats;
}

// What the retention limits are acting on, so the settings that control them can say
// what they will drop.
export function activityStatsRead(deps: ActivityStatsDeps = {}): Promise<Result<ActivityStats>> {
  const listHomes = deps.homes ?? pluginHomes;
  const stats = deps.stats ?? activityStats;
  return wrap(async () => {
    const dirs = (await listHomes()).filter((h) => h.present).map((h) => h.dir);
    return stats(dirs);
  });
}
