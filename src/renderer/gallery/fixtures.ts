import type { AccountQuota, CairnAPI, HomePlugins, HostApp, PluginHome } from "@cairn/shared";

export const HOST_APPS: HostApp[] = [
  { id: "alpha", label: "Alpha" },
  { id: "beta", label: "Beta" },
];

export const QUOTA: AccountQuota[] = [
  { label: "fast", remainingFraction: 0.72 },
  { label: "deep", remainingFraction: 0.14 },
  { label: "batch", remainingFraction: 1 },
  { label: "spare", remainingFraction: 0.5 },
];

export const STATUS = {
  good: { variant: "good", label: "Signed in" },
  warn: { variant: "warn", label: "Quota low" },
  off: { variant: "off", label: "Disabled" },
} as const;

export const LOREM =
  "Routes requests to a vendor endpoint and reports quota back to the control plane.";

export const LONG_NAME = "a-very-long-plugin-name-that-has-to-truncate-somewhere";

function home(id: string, label: string): PluginHome {
  return { id, label, dir: `/${id}`, present: true, hasUpdater: true };
}

const SECTIONS: HomePlugins[] = [
  { home: home("alpha", "Alpha"), rows: [
    { name: "wakatime-sync", kind: "git", present: true, enabled: true, updateAvailable: false, installedVersion: "1.4.0", description: "Reports coding activity to WakaTime." },
    { name: "config-ledger", kind: "git", present: true, enabled: true, updateAvailable: true, installedVersion: "3.0.2", description: "Keeps every home's config in one git repo." },
  ] },
  { home: home("beta", "Beta"), rows: [
    { name: "wakatime-sync", kind: "git", present: true, enabled: false, updateAvailable: false, installedVersion: "1.4.0", description: "Reports coding activity to WakaTime." },
  ] },
];

const CATALOG = [
  { name: "wakatime-sync", url: "https://example/wakatime-sync", kind: "plugin" as const, description: "Reports coding activity to WakaTime.", deprecated: false, topics: ["plugin", "metrics"] },
  { name: "config-ledger", url: "https://example/config-ledger", kind: "plugin" as const, description: "Keeps every home's config in one git repo.", deprecated: false, topics: ["plugin", "git"] },
  { name: "antigravity-auth", url: "https://example/antigravity-auth", kind: "provider" as const, description: LOREM, deprecated: false, topics: ["provider", "gemini"] },
  { name: LONG_NAME, url: "https://example/long", kind: "plugin" as const, description: LOREM, deprecated: true, topics: ["plugin"] },
];

// Enough of the API for the real screens to render populated in the gallery.
export function screenFixtures(): Partial<CairnAPI> {
  return {
    appsList: async () => ({ ok: true, data: HOST_APPS }),
    appsConnection: async (app: string) => ({
      ok: true,
      data: { app, cliPresent: app === "alpha", loaderId: `${app}-loader`, loaderUrl: null, loaderInstalled: app === "alpha" },
    }),
    pluginsList: async () => ({ ok: true, data: SECTIONS }),
    pluginsListCached: async () => ({ ok: true, data: SECTIONS }),
    catalogList: async () => ({ ok: true, data: { entries: CATALOG, source: "anonymous", org: "intisy-ai", rateLimited: false } }),
  };
}

