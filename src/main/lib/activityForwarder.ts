import { subscribeHomes, normalizeActivity, type ActivityRecord, type EventEnvelope } from "@intisy-ai/basekit";
import { pluginHomes } from "../../sidecar/lib/pluginHomes.js";
import type { PluginHome } from "../../../packages/shared/src/domain.js";

export interface ActivityForwarderDeps {
  homes?: () => Promise<PluginHome[]>;
  subscribe?: (homes: string[], topics: string, handler: (e: EventEnvelope) => void) => () => void;
  normalize?: (envelope: EventEnvelope, home?: string) => ActivityRecord;
}

// One subscription per present home (rather than a single subscribeHomes call
// across all of them) so normalizeActivity gets the correct home label per
// event; subscribeHomes fans every home into the same handler with no way to
// tell them apart from the envelope alone. Returns a teardown for app quit.
export async function startActivityForwarder(onEvent: (record: ActivityRecord) => void, deps: ActivityForwarderDeps = {}): Promise<() => void> {
  const listHomes = deps.homes ?? pluginHomes;
  const subscribe = deps.subscribe ?? subscribeHomes;
  const normalize = deps.normalize ?? normalizeActivity;
  const homes = (await listHomes()).filter((h) => h.present);
  const offs = homes.map((home) => subscribe([home.dir], "*", (envelope) => onEvent(normalize(envelope, home.dir))));
  return () => { for (const off of offs) off(); };
}
