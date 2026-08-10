import type { AccountQuota, AccountView, ActivityRecord, CairnAPI, HomePlugins, HostApp, PluginHome, ProviderRow } from "@cairn/shared";

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

const HOME_ALPHA: PluginHome = { id: "alpha", label: "Alpha", dir: "/alpha", present: true, hasUpdater: true };
const HOME_BETA: PluginHome = { id: "beta", label: "Beta", dir: "/beta", present: true, hasUpdater: true };

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
  { name: "wakatime-sync", url: "https://example/wakatime-sync", kind: "plugin" as const, description: "Reports coding activity to WakaTime.", deprecated: false, topics: ["plugin", "metrics"], sourceId: "intisy-ai" },
  { name: "config-ledger", url: "https://example/config-ledger", kind: "plugin" as const, description: "Keeps every home's config in one git repo.", deprecated: false, topics: ["plugin", "git"], sourceId: "intisy-ai" },
  { name: "antigravity-auth", url: "https://example/antigravity-auth", kind: "provider" as const, description: LOREM, deprecated: false, topics: ["provider", "gemini"], sourceId: "intisy-ai" },
  { name: LONG_NAME, url: "https://example/long", kind: "plugin" as const, description: LOREM, deprecated: true, topics: ["plugin"], sourceId: "intisy-ai" },
  { name: "demo-provider", url: "https://example/demo-provider", kind: "provider" as const, description: "A provider from a second marketplace.", deprecated: false, topics: ["ai-provider"], sourceId: "demo" },
  { name: "openai-translator", url: "https://example/openai-translator", kind: "translator" as const, description: "Translates the OpenAI wire format to the canonical IR.", deprecated: false, topics: ["vendor-translator", "openai"], sourceId: "intisy-ai" },
  { name: "gemini-translator", url: "https://example/gemini-translator", kind: "translator" as const, description: "Translates the Gemini wire format to the canonical IR.", deprecated: false, topics: ["vendor-translator", "gemini"], sourceId: "intisy-ai" },
];

// What custom-auth's cairn.json declares: a category selected by TOPIC, so a translator
// published later joins it without custom-auth changing.
const CONTRIBUTIONS = [
  { id: "translators", label: "Translators", match: { topics: ["vendor-translator"] }, contributedBy: "custom-auth" },
];

// One healthy source and one that failed, which is the state the screen has to render
// without losing the entries the healthy one returned.
const CATALOG_SOURCES = [
  { id: "intisy-ai", label: "intisy-ai", type: "github-org" as const, ok: true, entryCount: 4 },
  { id: "demo", label: "Demo", type: "local" as const, ok: true, entryCount: 1, shadowed: [{ name: "wakatime-sync", by: "intisy-ai" }] },
  { id: "acme", label: "Acme", type: "manifest" as const, ok: false, entryCount: 0, error: "http 404" },
];

const PROVIDERS: ProviderRow[] = [
  { id: "antigravity", label: "Antigravity", accountPool: "antigravity", sharedWith: ["gemini-cli"], pluginName: "antigravity-auth", authKind: "oauth", accountCount: 3, enabled: true, exposure: { alpha: true, beta: false }, translator: "gemini" },
  { id: "gemini-cli", label: "Gemini CLI", accountPool: "antigravity", sharedWith: ["antigravity"], pluginName: "antigravity-auth", authKind: "oauth", accountCount: 3, enabled: true, exposure: { alpha: true, beta: false }, translator: "gemini" },
  { id: "claude-code", label: "Claude Code", accountPool: "claude-code", sharedWith: [], pluginName: "claude-code-auth", authKind: "oauth", accountCount: 0, enabled: true, exposure: { alpha: false, beta: false } },
  { id: "stub", label: "Stub", accountPool: "stub", sharedWith: [], pluginName: "stub-auth", authKind: "api-key", accountCount: 0, enabled: false, exposure: { alpha: false, beta: false } },
  // Falls back to its raw id because its plugin bundle never loaded, the state the
  // Providers and Accounts screens both have to say out loud.
  { id: "half-built", label: "half-built", accountPool: "half-built", sharedWith: [], pluginName: "half-built-auth", authKind: "api-key", accountCount: 0, enabled: false, exposure: { alpha: false, beta: false }, defsError: "Cannot find package '@intisy-ai/core-auth' imported from dist/handler.js" },
];

const ACCOUNTS: AccountView[] = [
  { id: "acc1", email: "ben@birich.de", status: "active", enabled: true, detail: "oauth", quota: QUOTA },
  { id: "acc2", email: "spare@example.com", status: "rate-limited", enabled: true, detail: "oauth", quota: QUOTA.slice(1, 2) },
];

// Exported so the overlay specimens can render a dialog against the same data the
// Activity screen uses, rather than inventing a second version of it.
export const ACTIVITY: ActivityRecord[] = [
  {
    id: "act-1", ts: Date.parse("2026-08-10T11:59:00Z"), home: "/home/alpha", topic: "plugin.install",
    action: "plugin_installed", actor: "user", impact: "notice", source: "plugin-updater",
    subject: { kind: "plugin", id: "antigravity-auth", label: "antigravity-auth" },
    details: { url: "https://example/antigravity-auth", message: "Installed antigravity-auth into Alpha" },
    text: "Installed antigravity-auth into Alpha",
    origin: { app: "alpha", home: "/home/alpha", entry: "cairn" },
    cause: { kind: "user", surface: "plugins" }, trace: { id: "trace-1" }, outcome: "ok", durationMs: 8400,
  },
  {
    id: "act-2", ts: Date.parse("2026-08-10T11:58:00Z"), home: "/home/alpha", topic: "provider.state",
    action: "provider_enabled", actor: "user", impact: "info", source: "cairn",
    subject: { kind: "provider", id: "antigravity", label: "Antigravity" },
    details: { message: "Enabled antigravity everywhere" },
    text: "Enabled antigravity everywhere",
    origin: { app: "alpha", home: "/home/alpha", entry: "cairn" },
    cause: { kind: "user", surface: "providers" }, trace: { id: "trace-2" },
    changes: [{ key: "exposure.alpha", from: false, to: true }, { key: "apiKey", redacted: true }],
  },
  {
    id: "act-3", ts: Date.parse("2026-08-10T11:40:00Z"), home: "/home/beta", topic: "plugin.build",
    action: "plugin_repair_failed", actor: "system", impact: "error", source: "plugin-updater",
    subject: { kind: "plugin", id: "custom-auth", label: "custom-auth" },
    details: { missing: "core-auth/dist", message: "Repair left core-auth/dist missing" },
    text: "Repair left core-auth/dist missing",
    origin: { app: "beta", home: "/home/beta", entry: "updater" },
    cause: { kind: "user", surface: "plugins" }, trace: { id: "trace-3" }, outcome: "failed", durationMs: 66000,
  },
];

// Enough of the API for the real screens to render populated in the gallery.
export function screenFixtures(): Partial<CairnAPI> {
  return {
    activityRead: async () => ({ ok: true, data: { records: ACTIVITY, nextCursor: undefined } }),
    marketplaceSourcesList: async () => ({
      ok: true,
      data: [
        { id: "intisy-ai", label: "intisy-ai", type: "github-org" as const, org: "intisy-ai" },
        { id: "demo", label: "Demo", type: "local" as const, path: "/home/me/marketplace-demo" },
        { id: "acme", label: "Acme", type: "manifest" as const, url: "https://acme.example/marketplace.json", enabled: false },
      ],
    }),
    marketplaceSourcesSave: async (sources) => ({ ok: true, data: sources }),
    enginesList: async () => ({ ok: true, data: [] }),
    librariesList: async () => ({ ok: true, data: [
      { home: HOME_ALPHA, shared: [
        { specifier: "@intisy-ai/core", version: "2.1.0", usedBy: ["antigravity-auth", "claude-code-auth"] },
        { specifier: "@intisy-ai/left-behind", version: "0.9.0", usedBy: [] },
      ], plugins: [{ plugin: "antigravity-auth", dependencies: [{ specifier: "@openauthjs/openauth", version: "0.4.3", usedBy: [] }] }] },
      { home: HOME_BETA, shared: [{ specifier: "@intisy-ai/core", version: "2.0.4", usedBy: ["claude-code-auth"] }], plugins: [] },
    ] }),
    appsList: async () => ({ ok: true, data: HOST_APPS }),
    appsConnection: async (app: string) => ({
      ok: true,
      data: { app, cliPresent: app === "alpha", loaderId: `${app}-loader`, loaderUrl: null, loaderInstalled: app === "alpha" },
    }),
    providersList: async () => ({ ok: true, data: PROVIDERS }),
    accountsList: async (id: string) => ({ ok: true, data: id === "antigravity" ? ACCOUNTS : [] }),
    pluginsList: async () => ({ ok: true, data: SECTIONS }),
    pluginsListCached: async () => ({ ok: true, data: SECTIONS }),
    catalogList: async () => ({ ok: true, data: { entries: CATALOG, source: "anonymous", org: "intisy-ai", rateLimited: false, sources: CATALOG_SOURCES, contributions: CONTRIBUTIONS } }),
  };
}

