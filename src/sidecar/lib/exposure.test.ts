import { describe, it, expect, beforeEach, vi } from "vitest";

// The provider-works-everywhere model lives in exposure defaults: a provider is
// exposed in every registered app unless explicitly turned off, and the default
// set is recomputed from the current app registry on every read. These tests pin
// that behavior so an install-once provider keeps working across all apps, and a
// newly-added app inherits every existing provider.
const state: { apps: { id: string }[]; store: Record<string, unknown> } = { apps: [], store: {} };

vi.mock("@intisy-ai/core", () => ({
  getApps: () => state.apps,
  getConfigValue: (name: string, key: string) => state.store[name + ":" + key],
  setConfigValue: (name: string, key: string, value: unknown) => { state.store[name + ":" + key] = value; },
}));

import { defaultExposure, exposureFor, setExposure, readExposureMap } from "./exposure.js";

beforeEach(() => {
  state.apps = [{ id: "claude" }, { id: "opencode" }];
  state.store = {};
});

describe("provider exposure defaults (works-everywhere)", () => {
  it("defaults a provider to exposed in every registered app", () => {
    expect(defaultExposure()).toEqual({ claude: true, opencode: true });
    // A provider with no stored entry is on everywhere.
    expect(exposureFor({}, "any-provider")).toEqual({ claude: true, opencode: true });
  });

  it("keeps other apps on when one app is turned off for a provider", () => {
    setExposure("prov", "opencode", false);
    expect(exposureFor(readExposureMap(), "prov")).toEqual({ claude: true, opencode: false });
  });

  it("auto-inherits a provider into an app added after the exposure was stored", () => {
    setExposure("prov", "opencode", false); // stored while only claude+opencode exist
    state.apps = [{ id: "claude" }, { id: "opencode" }, { id: "newapp" }];
    const exposure = exposureFor(readExposureMap(), "prov");
    expect(exposure.newapp).toBe(true); // new app inherits the provider
    expect(exposure.opencode).toBe(false); // the explicit opt-out is preserved
  });

  it("readExposureMap returns stored entries unchanged", () => {
    state.store["dashboard-exposure:map"] = { "wakatime-sync": { claude: false } };
    expect(readExposureMap()).toEqual({ "wakatime-sync": { claude: false } });
  });
});
