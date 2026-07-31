import { getApps, getConfigValue, setConfigValue } from "@core/index.js";

const EXPOSURE_CONFIG_NAME = "dashboard-exposure";
const EXPOSURE_CONFIG_KEY = "map";

export type ExposureMap = Record<string, Record<string, boolean>>;

export function defaultExposure(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const app of getApps()) out[app.id] = true;
  return out;
}

export function readExposureMap(): ExposureMap {
  return (getConfigValue(EXPOSURE_CONFIG_NAME, EXPOSURE_CONFIG_KEY) as ExposureMap | undefined) ?? {};
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
