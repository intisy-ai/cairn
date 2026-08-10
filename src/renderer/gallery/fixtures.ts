import type { AccountQuota, AccountView, CairnAPI, HomePlugins, HostApp, PluginHome, ProviderRow } from "@cairn/shared";

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

const PROVIDERS: ProviderRow[] = [
  { id: "antigravity", label: "Antigravity", accountPool: "antigravity", sharedWith: [], pluginName: "antigravity-auth", authKind: "oauth", accountCount: 3, enabled: true, exposure: { alpha: true, beta: false }, translator: "gemini" },
  { id: "claude-code", label: "Claude Code", accountPool: "claude-code", sharedWith: [], pluginName: "claude-code-auth", authKind: "oauth", accountCount: 0, enabled: true, exposure: { alpha: false, beta: false } },
  { id: "stub", label: "Stub", accountPool: "stub", sharedWith: [], pluginName: "stub-auth", authKind: "api-key", accountCount: 0, enabled: false, exposure: { alpha: false, beta: false } },
];

const ACCOUNTS: AccountView[] = [
  { id: "acc1", email: "ben@birich.de", status: "active", enabled: true, detail: "oauth", quota: QUOTA },
  { id: "acc2", email: "spare@example.com", status: "rate-limited", enabled: true, detail: "oauth", quota: QUOTA.slice(1, 2) },
];

// Enough of the API for the real screens to render populated in the gallery.
export function screenFixtures(): Partial<CairnAPI> {
  return {
    appsList: async () => ({ ok: true, data: HOST_APPS }),
    appsConnection: async (app: string) => ({
      ok: true,
      data: { app, cliPresent: app === "alpha", loaderId: `${app}-loader`, loaderUrl: null, loaderInstalled: app === "alpha" },
    }),
    providersList: async () => ({ ok: true, data: PROVIDERS }),
    accountsList: async (id: string) => ({ ok: true, data: id === "antigravity" ? ACCOUNTS : [] }),
    pluginsList: async () => ({ ok: true, data: SECTIONS }),
    pluginsListCached: async () => ({ ok: true, data: SECTIONS }),
    catalogList: async () => ({ ok: true, data: { entries: CATALOG, source: "anonymous", org: "intisy-ai", rateLimited: false } }),
  };
}

