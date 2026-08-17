import { pluginHomes } from "../lib/pluginHomes.js";
import { ledgerFor, quarantinedIn } from "../lib/pluginHost.js";
import type { HomeLedger, LedgerRowView, PluginHome, QuarantineView, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

export interface DiagnosticsDeps {
  homes?: PluginHome[];
}

/**
 * Every plugin's declared and actual relationships, per home.
 *
 * @remarks
 * The host records each relationship as it is made, because a relationship is only observable at
 * the moment it happens. `unresolved` is the exception: it asks the live registry, since whether a
 * consumed service is answered depends on what is registered right now.
 */
export function pluginLedger(deps: DiagnosticsDeps = {}): Promise<Result<HomeLedger[]>> {
  return wrap(async () => {
    const homes = deps.homes ?? (await pluginHomes());
    return Promise.all(homes.map(async (home) => ({
      home,
      rows: (await ledgerFor(home.dir, home.id)).map((row): LedgerRowView => {
        const view: LedgerRowView = {
          pluginId: row.pluginId,
          status: row.status,
          capabilitiesDeclared: row.capabilitiesDeclared,
          capabilities: row.capabilities,
          provides: row.services.provides,
          consumes: row.services.consumes,
          unresolved: row.unresolved,
          topics: row.topics,
          permissions: row.permissions,
        };
        if (row.error) view.error = row.error;
        return view;
      }),
    })));
  });
}

/** Every plugin a home refused to load, with the reason and the fix, across all homes. */
export function pluginQuarantine(deps: DiagnosticsDeps = {}): Promise<Result<QuarantineView[]>> {
  return wrap(async () => {
    const homes = deps.homes ?? (await pluginHomes());
    const out: QuarantineView[] = [];
    for (const home of homes) {
      for (const record of await quarantinedIn(home.dir, home.id)) {
        out.push({ homeId: home.id, homeLabel: home.label, pluginId: record.pluginId, detail: record.detail, fix: record.fix });
      }
    }
    return out;
  });
}
