import { describe, it, expect, beforeEach } from "vitest";
import { scanOrg, resetOrgScanCacheForTests } from "./orgScan.js";

beforeEach(() => resetOrgScanCacheForTests());

const repo = (name: string, topics: string[] = ["plugin"], archived = false) => ({
  name,
  html_url: `https://github.com/intisy-ai/${name}`,
  description: `${name} desc`,
  archived,
  topics,
});
const okFetch = (repos: unknown[]) => (async () => ({ ok: true, status: 200, json: async () => repos })) as unknown as typeof fetch;

describe("scanOrg", () => {
  it("lists only repos carrying an installable category topic, mapping the topic to a kind", async () => {
    const result = await scanOrg({
      fetchFn: okFetch([
        repo("stub-auth", ["intisy-ai", "ai-provider"]),
        repo("core-ir", ["intisy-ai", "core-library"]),
        repo("agentbox", []),
        repo("opencode-proxy", ["intisy-ai", "app-proxy"]),
      ]),
      env: { GITHUB_TOKEN: "t" },
      execFn: async () => "",
    });
    expect(result.source).toBe("env");
    expect(result.entries.map((e) => [e.name, e.kind])).toEqual([
      ["stub-auth", "provider"],
      ["opencode-proxy", "proxy"],
    ]);
  });

  it("serves the TTL cache within 60s and never clobbers a good result with a failure", async () => {
    let t = 0;
    const now = () => t;
    const good = await scanOrg({ fetchFn: okFetch([repo("stub-auth", ["ai-provider"])]), env: {}, execFn: async () => "", now });
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
    const result = await scanOrg({ fetchFn: okFetch([repo("stub-auth", ["intisy-ai", "ai-provider"])]), env: { GITHUB_TOKEN: "t" }, execFn: async () => "" });
    expect(result.entries.find((e) => e.name === "stub-auth")?.topics).toEqual(["intisy-ai", "ai-provider"]);
  });

  it("enriches an entry with displayName + icon from cairn.json", async () => {
    const manifest = { displayName: "Sync Bridge", icon: "icon.svg" };
    const fetchFn = (async (url: string) => {
      if (url.includes("/contents/cairn.json")) return { ok: true, status: 200, json: async () => ({ encoding: "base64", content: Buffer.from(JSON.stringify(manifest)).toString("base64") }) };
      if (url.includes("/contents/icon.svg")) return { ok: true, status: 200, json: async () => ({ encoding: "base64", content: Buffer.from("<svg/>").toString("base64") }) };
      return { ok: true, status: 200, json: async () => [repo("sync-bridge", ["plugin"])] };
    }) as unknown as typeof fetch;
    const result = await scanOrg({ fetchFn, env: { GITHUB_TOKEN: "t" }, execFn: async () => "" });
    const entry = result.entries.find((e) => e.name === "sync-bridge");
    expect(entry?.displayName).toBe("Sync Bridge");
    expect(entry?.icon).toContain("data:image/svg+xml;base64,");
  });

  it("maps an archived installable repo to a deprecated entry instead of skipping it", async () => {
    const result = await scanOrg({
      fetchFn: okFetch([repo("stub-auth", ["ai-provider"]), repo("old-plugin", ["plugin"], true)]),
      env: { GITHUB_TOKEN: "t" },
      execFn: async () => "",
    });
    expect(result.entries.find((e) => e.name === "old-plugin")?.deprecated).toBe(true);
    expect(result.entries.find((e) => e.name === "stub-auth")?.deprecated).toBe(false);
  });
});
