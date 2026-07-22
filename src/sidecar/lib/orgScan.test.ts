import { describe, it, expect, beforeEach } from "vitest";
import { classifyRepo, scanOrg, resetOrgScanCacheForTests } from "./orgScan.js";

beforeEach(() => resetOrgScanCacheForTests());

describe("classifyRepo", () => {
  it("applies the naming rules", () => {
    expect(classifyRepo("claude-code-proxy")).toBe("proxy");
    expect(classifyRepo("antigravity-auth")).toBe("provider");
    expect(classifyRepo("wakatime-sync")).toBe("plugin");
    for (const excluded of ["claude-code-loader", "core-proxy", "ai-java", "workflows", "cairn", "agentbox"]) {
      expect(classifyRepo(excluded)).toBeNull();
    }
  });
});

const repo = (name: string) => ({ name, html_url: `https://github.com/intisy-ai/${name}`, description: `${name} desc` });
const okFetch = (repos: unknown[]) => (async () => ({ ok: true, status: 200, json: async () => repos })) as unknown as typeof fetch;

describe("scanOrg", () => {
  it("classifies and maps org repos, reporting the token source", async () => {
    const result = await scanOrg({ fetchFn: okFetch([repo("stub-auth"), repo("core-ir"), repo("opencode-proxy")]), env: { GITHUB_TOKEN: "t" }, execFn: async () => "" });
    expect(result.source).toBe("env");
    expect(result.entries).toEqual([
      { name: "stub-auth", url: "https://github.com/intisy-ai/stub-auth", kind: "provider", description: "stub-auth desc" },
      { name: "opencode-proxy", url: "https://github.com/intisy-ai/opencode-proxy", kind: "proxy", description: "opencode-proxy desc" },
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
});
