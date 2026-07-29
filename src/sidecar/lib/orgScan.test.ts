import { describe, it, expect, beforeEach } from "vitest";
import { classifyRepo, scanOrg, resetOrgScanCacheForTests } from "./orgScan.js";

beforeEach(() => resetOrgScanCacheForTests());

describe("classifyRepo", () => {
  it("applies the naming rules", () => {
    expect(classifyRepo("claude-code-proxy")).toBe("proxy");
    expect(classifyRepo("antigravity-auth")).toBe("provider");
    expect(classifyRepo("wakatime-sync")).toBe("plugin");
    for (const excluded of ["claude-code-loader", "core-proxy", "ai-java", "workflows", "cairn", "agentbox", "core"]) {
      expect(classifyRepo(excluded)).toBeNull();
    }
  });
});

const repo = (name: string, archived = false) => ({ name, html_url: `https://github.com/intisy-ai/${name}`, description: `${name} desc`, archived });
const okFetch = (repos: unknown[]) => (async () => ({ ok: true, status: 200, json: async () => repos })) as unknown as typeof fetch;

describe("scanOrg", () => {
  it("classifies and maps org repos, reporting the token source", async () => {
    const result = await scanOrg({ fetchFn: okFetch([repo("stub-auth"), repo("core-ir"), repo("opencode-proxy")]), env: { GITHUB_TOKEN: "t" }, execFn: async () => "" });
    expect(result.source).toBe("env");
    expect(result.entries).toEqual([
      { name: "stub-auth", url: "https://github.com/intisy-ai/stub-auth", kind: "provider", description: "stub-auth desc", deprecated: false, topics: [] },
      { name: "opencode-proxy", url: "https://github.com/intisy-ai/opencode-proxy", kind: "proxy", description: "opencode-proxy desc", deprecated: false, topics: [] },
    ]);
  });

  it("serves the TTL cache within 60s and never clobbers a good result with a failure", async () => {
    let t = 0;
    const now = () => t;
    const good = await scanOrg({ fetchFn: okFetch([repo("stub-auth")]), env: {}, execFn: async () => "", now });
    expect(good.entries).toHaveLength(1);
    t = 61_000;
    const afterFail = await scanOrg({ fetchFn: (async () => { throw new Error("net down"); }) as unknown as typeof fetch, env: {}, execFn: async () => "", now });
    expect(afterFail.entries).toHaveLength(1);
  });

  it("falls back env -> gh -> anonymous", async () => {
    const viaGh = await scanOrg({ fetchFn: okFetch([]), env: {}, execFn: async (f, a) => (f === "gh" && a[0] === "auth" ? "ghtoken\n" : "") });
    expect(viaGh.source).toBe("gh");
    resetOrgScanCacheForTests();
    const anon = await scanOrg({ fetchFn: okFetch([]), env: {}, execFn: async () => { throw new Error("no gh"); } });
    expect(anon.source).toBe("anonymous");
  });

  it("carries repo topics onto the catalog entry", async () => {
    const withTopics = { name: "stub-auth", html_url: "https://github.com/intisy-ai/stub-auth", description: "d", archived: false, topics: ["intisy-ai", "ai-provider"] };
    const result = await scanOrg({ fetchFn: okFetch([withTopics]), env: { GITHUB_TOKEN: "t" }, execFn: async () => "" });
    expect(result.entries.find((e) => e.name === "stub-auth")?.topics).toEqual(["intisy-ai", "ai-provider"]);
  });

  it("enriches an entry with displayName + icon from cairn.json", async () => {
    const manifest = { displayName: "Sync Bridge", icon: "icon.svg" };
    const fetchFn = (async (url: string) => {
      if (url.includes("/contents/cairn.json")) return { ok: true, status: 200, json: async () => ({ encoding: "base64", content: Buffer.from(JSON.stringify(manifest)).toString("base64") }) };
      if (url.includes("/contents/icon.svg")) return { ok: true, status: 200, json: async () => ({ encoding: "base64", content: Buffer.from("<svg/>").toString("base64") }) };
      return { ok: true, status: 200, json: async () => [repo("sync-bridge")] };
    }) as unknown as typeof fetch;
    const result = await scanOrg({ fetchFn, env: { GITHUB_TOKEN: "t" }, execFn: async () => "" });
    const entry = result.entries.find((e) => e.name === "sync-bridge");
    expect(entry?.displayName).toBe("Sync Bridge");
    expect(entry?.icon).toContain("data:image/svg+xml;base64,");
  });

  it("maps archived repos to deprecated entries instead of skipping them", async () => {
    const archived = { name: "metric-dashboard", html_url: "https://github.com/intisy-ai/metric-dashboard", description: "", archived: true };
    const result = await scanOrg({ fetchFn: okFetch([repo("stub-auth"), archived]), env: { GITHUB_TOKEN: "t" }, execFn: async () => "" });
    expect(result.entries.find((e) => e.name === "metric-dashboard")?.deprecated).toBe(true);
    expect(result.entries.find((e) => e.name === "stub-auth")?.deprecated).toBe(false);
  });
});
