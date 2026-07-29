import { getApps, getConfigValue, setConfigValue } from "@core/index.js";

const EXPOSURE_CONFIG_NAME = "dashboard-exposure";
const EXPOSURE_CONFIG_KEY = "map";
const LEGACY_KEYS: Record<string, string> = { cc: "claude", oc: "opencode" };

export type ExposureMap = Record<string, Record<string, boolean>>;

export function defaultExposure(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const app of getApps()) out[app.id] = true;
  return out;
}

function migrateEntry(entry: Record<string, boolean>): { migrated: Record<string, boolean>; changed: boolean } {
  let changed = false;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(entry)) {
    const mapped = LEGACY_KEYS[k];
    if (mapped) {
      out[mapped] = v;
      changed = true;
    } else {
      out[k] = v;
    }
  }
  return { migrated: out, changed };
}

// Legacy exposure entries were keyed by the old cc/oc shorthand; re-key them to app ids once on read and persist the migration.
export function readExposureMap(): ExposureMap {
  const raw = (getConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY) as ExposureMap | undefined) ?? {};
  let anyChanged = false;
  const out: ExposureMap = {};
  for (const [id, entry] of Object.entries(raw)) {
    const { migrated, changed } = migrateEntry(entry ?? {});
    out[id] = migrated;
    anyChanged = anyChanged || changed;
  }
  if (anyChanged) setConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY, out);
  return out;
}

export function exposureFor(map: ExposureMap, id: string): Record<string, boolean> {
  const stored = map[id] ?? {};
  return { ...defaultExposure(), ...stored };
}

export function setExposure(id: string, appId: string, on: boolean): void {
  const map = readExposureMap();
  map[id] = { ...exposureFor(map, id), [appId]: on };
  setConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY, map);
}

export function exposeProviders(providerIds: string[], appId: string): void {
  const map = readExposureMap();
  for (const id of providerIds) {
    map[id] = { ...(map[id] ?? {}), [appId]: true };
  }
  setConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY, map);
}
