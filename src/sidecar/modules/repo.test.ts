import { describe, it, expect, beforeEach } from "vitest";
import { repoMeta, parseOwnerRepo, resetRepoMetaCacheForTests } from "./repo.js";

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

function fetchStub(repoJson: unknown | null, readme?: { ok: boolean; content?: string }) {
  let repoCalls = 0;
  const fn = (async (url: string) => {
    if (String(url).endsWith("/readme")) {
      if (!readme || !readme.ok) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ encoding: "base64", content: b64(readme.content ?? "") }) };
    }
    repoCalls++;
    if (repoJson === null) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => repoJson };
  }) as unknown as typeof fetch;
  return { fn, calls: () => repoCalls };
}

const noToken = { execFn: async () => "", env: {} as NodeJS.ProcessEnv };

describe("parseOwnerRepo", () => {
  it("parses full urls, .git suffixes, and shorthand", () => {
    expect(parseOwnerRepo("https://github.com/o/r")).toEqual({ owner: "o", repo: "r" });
    expect(parseOwnerRepo("https://github.com/o/r.git")).toEqual({ owner: "o", repo: "r" });
    expect(parseOwnerRepo("o/r")).toEqual({ owner: "o", repo: "r" });
  });
  it("returns null for non-repo strings", () => {
    expect(parseOwnerRepo("not a url")).toBeNull();
    expect(parseOwnerRepo("https://example.com/x")).toBeNull();
  });
});

describe("repoMeta", () => {
  beforeEach(() => resetRepoMetaCacheForTests());

  it("returns stars, description, topics and a decoded readme", async () => {
    const { fn } = fetchStub(
      { stargazers_count: 42, description: "d", topics: ["a", "b"], html_url: "https://github.com/o/r" },
      { ok: true, content: "# Title" },
    );
    const res = await repoMeta("https://github.com/o/r", { ...noToken, fetchFn: fn, now: () => 1 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.data).toEqual({
      owner: "o",
      repo: "r",
      htmlUrl: "https://github.com/o/r",
      stars: 42,
      description: "d",
      topics: ["a", "b"],
      readme: "# Title",
    });
  });

  it("leaves readme null when the readme endpoint 404s", async () => {
    const { fn } = fetchStub({ stargazers_count: 1, description: "", topics: [], html_url: "https://github.com/o/r" });
    const res = await repoMeta("o/r", { ...noToken, fetchFn: fn, now: () => 1 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.data.readme).toBeNull();
  });

  it("errors for a non-GitHub url", async () => {
    const res = await repoMeta("nope", noToken);
    expect(res.ok).toBe(false);
  });

  it("errors when the repo endpoint fails", async () => {
    const { fn } = fetchStub(null);
    const res = await repoMeta("o/r", { ...noToken, fetchFn: fn, now: () => 1 });
    expect(res.ok).toBe(false);
  });

  it("serves the second call from cache without refetching", async () => {
    const { fn, calls } = fetchStub({ stargazers_count: 5, description: "", topics: [], html_url: "https://github.com/o/r" });
    await repoMeta("o/r", { ...noToken, fetchFn: fn, now: () => 1000 });
    await repoMeta("o/r", { ...noToken, fetchFn: fn, now: () => 2000 });
    expect(calls()).toBe(1);
  });
});
