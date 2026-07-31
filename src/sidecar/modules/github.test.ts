import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigValue, setConfigValue } from "@core/index.js";
import { resetOrgScanCache, resolveToken } from "../lib/orgScan.js";
import { githubStatus, githubAddAccount, githubSwitchAccount, githubRemoveAccount, githubConnectGhCli, githubSetStar, githubStarCairn } from "./github.js";

beforeEach(() => {
  resetOrgScanCache();
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-github-"));
});

const userFetch = (login: string, extra: { name?: string | null; avatar_url?: string | null } = {}) =>
  (async () => ({ ok: true, status: 200, json: async () => ({ login, ...extra }) })) as unknown as typeof fetch;

const failFetch = (status: number) =>
  (async () => ({ ok: false, status, json: async () => ({}) })) as unknown as typeof fetch;

const noGh = async (): Promise<string> => { throw new Error("no gh"); };

describe("githubStatus", () => {
  it("reports connected via an env token, with identity from the GitHub API", async () => {
    const result = await githubStatus({
      env: { GITHUB_TOKEN: "t" },
      execFn: noGh,
      fetchFn: userFetch("octocat", { name: "Octo Cat", avatar_url: "https://avatars.githubusercontent.com/u/1" }),
    });
    expect(result).toEqual({
      ok: true,
      data: {
        source: "env",
        connected: true,
        login: "octocat",
        name: "Octo Cat",
        avatarUrl: "https://avatars.githubusercontent.com/u/1",
        ghCliDetected: false,
        ghCli: null,
        accounts: [],
        activeLogin: null,
        cairnRepoUrl: "https://github.com/intisy-ai/cairn",
        cairnStarred: null,
      },
    });
  });

  it("reports anonymous with no login when no token is available anywhere", async () => {
    const result = await githubStatus({
      env: {},
      execFn: noGh,
      fetchFn: (async () => { throw new Error("should not be called"); }) as unknown as typeof fetch,
    });
    expect(result).toEqual({
      ok: true,
      data: { source: "anonymous", connected: false, login: null, name: null, avatarUrl: null, ghCliDetected: false, ghCli: null, accounts: [], activeLogin: null, cairnRepoUrl: "https://github.com/intisy-ai/cairn", cairnStarred: null },
    });
  });

  it("flags the local gh CLI as detected and resolves its identity even when a different source wins the token", async () => {
    const result = await githubStatus({
      env: { GITHUB_TOKEN: "t" },
      execFn: async (f, a) => (f === "gh" && a[0] === "auth" ? "ghtoken" : ""),
      fetchFn: userFetch("clidev", { name: "CLI Dev" }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.source).toBe("env");
      expect(result.data.ghCliDetected).toBe(true);
      expect(result.data.ghCli).toEqual({ login: "clidev", name: "CLI Dev", avatarUrl: null });
    }
  });

  it("reports ghCli as null when gh is not installed", async () => {
    const result = await githubStatus({ env: { GITHUB_TOKEN: "t" }, execFn: noGh, fetchFn: userFetch("octocat") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ghCliDetected).toBe(false);
      expect(result.data.ghCli).toBeNull();
    }
  });

  it("stays connected but reports a null identity when the GitHub API call fails", async () => {
    const result = await githubStatus({ env: { GITHUB_TOKEN: "t" }, execFn: noGh, fetchFn: failFetch(401) });
    expect(result).toEqual({
      ok: true,
      data: { source: "env", connected: true, login: null, name: null, avatarUrl: null, ghCliDetected: false, ghCli: null, accounts: [], activeLogin: null, cairnRepoUrl: "https://github.com/intisy-ai/cairn", cairnStarred: null },
    });
  });

  it("lists stored accounts and the active login, using the stored identity for a config-sourced active account", async () => {
    await githubAddAccount("token-a", false, { fetchFn: userFetch("alice", { name: "Alice A", avatar_url: "https://avatars.githubusercontent.com/u/2" }) });
    await githubAddAccount("token-b", false, { fetchFn: userFetch("bob", { name: "Bob B" }) });
    const status = await githubStatus({ env: {}, execFn: noGh, fetchFn: (async () => { throw new Error("should not be called"); }) as unknown as typeof fetch });
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.data.source).toBe("config");
      expect(status.data.login).toBe("bob");
      expect(status.data.name).toBe("Bob B");
      expect(status.data.accounts).toEqual([
        { login: "alice", name: "Alice A", avatarUrl: "https://avatars.githubusercontent.com/u/2" },
        { login: "bob", name: "Bob B", avatarUrl: null },
      ]);
      expect(status.data.activeLogin).toBe("bob");
    }
  });
});

// Records every call and answers /user with the given login, plus the starred-repo
// PUT with a bare 204 (or throws/errs when starBehavior says so).
function spyFetch(
  login: string,
  calls: { url: string; init?: { method?: string; headers?: Record<string, string> } }[],
  starBehavior: "ok" | "throw" | "403" = "ok",
): typeof fetch {
  return (async (url: string, init?: { method?: string; headers?: Record<string, string> }) => {
    calls.push({ url, init });
    if (url.includes("/user/starred/")) {
      if (starBehavior === "throw") throw new Error("network error");
      if (starBehavior === "403") return { ok: false, status: 403, json: async () => ({}) };
      return { ok: true, status: 204, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => ({ login }) };
  }) as unknown as typeof fetch;
}

describe("githubAddAccount", () => {
  it("validates the token via the GitHub API, stores the identity, and makes it active", async () => {
    const result = await githubAddAccount("  new-token  ", false, { fetchFn: userFetch("octocat", { name: "Octo Cat", avatar_url: "https://avatars.githubusercontent.com/u/1" }) });
    expect(result).toEqual({ ok: true, data: { login: "octocat" } });
    expect(getConfigValue("cairn", "githubAccounts")).toEqual([
      { login: "octocat", token: "new-token", name: "Octo Cat", avatarUrl: "https://avatars.githubusercontent.com/u/1" },
    ]);
    expect(getConfigValue("cairn", "githubActiveLogin")).toBe("octocat");
  });

  it("stores null name/avatarUrl when the API response omits them", async () => {
    await githubAddAccount("token", false, { fetchFn: userFetch("octocat") });
    expect(getConfigValue("cairn", "githubAccounts")).toEqual([{ login: "octocat", token: "token", name: null, avatarUrl: null }]);
  });

  it("replaces an existing entry for the same login instead of duplicating it", async () => {
    await githubAddAccount("token-1", false, { fetchFn: userFetch("octocat", { name: "Old Name" }) });
    await githubAddAccount("token-2", false, { fetchFn: userFetch("octocat", { name: "New Name" }) });
    expect(getConfigValue("cairn", "githubAccounts")).toEqual([{ login: "octocat", token: "token-2", name: "New Name", avatarUrl: null }]);
  });

  it("rejects an invalid token and stores nothing", async () => {
    const result = await githubAddAccount("bad-token", false, { fetchFn: failFetch(401) });
    expect(result.ok).toBe(false);
    expect(getConfigValue("cairn", "githubAccounts")).toBeUndefined();
  });

  it("rejects a blank token without calling the network", async () => {
    const result = await githubAddAccount("   ", false, { fetchFn: (async () => { throw new Error("should not be called"); }) as unknown as typeof fetch });
    expect(result.ok).toBe(false);
  });

  it("stars Cairn when star is true", async () => {
    const calls: { url: string; init?: { method?: string; headers?: Record<string, string> } }[] = [];
    const result = await githubAddAccount("token", true, { fetchFn: spyFetch("octocat", calls) });
    expect(result.ok).toBe(true);
    const starCall = calls.find((c) => c.url === "https://api.github.com/user/starred/intisy-ai/cairn");
    expect(starCall).toBeDefined();
    expect(starCall?.init?.method).toBe("PUT");
    expect(starCall?.init?.headers?.Authorization).toBe("Bearer token");
  });

  it("does not star when star is false", async () => {
    const calls: { url: string }[] = [];
    const result = await githubAddAccount("token", false, { fetchFn: spyFetch("octocat", calls) });
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.url.includes("/user/starred/"))).toBe(false);
  });

  it("still stores the account and reports success when starring throws", async () => {
    const calls: { url: string }[] = [];
    const result = await githubAddAccount("token", true, { fetchFn: spyFetch("octocat", calls, "throw") });
    expect(result).toEqual({ ok: true, data: { login: "octocat" } });
    expect(getConfigValue("cairn", "githubAccounts")).toEqual([{ login: "octocat", token: "token", name: null, avatarUrl: null }]);
  });

  it("still stores the account and reports success when starring returns a non-2xx (insufficient scope)", async () => {
    const calls: { url: string }[] = [];
    const result = await githubAddAccount("token", true, { fetchFn: spyFetch("octocat", calls, "403") });
    expect(result.ok).toBe(true);
    expect(getConfigValue("cairn", "githubAccounts")).toEqual([{ login: "octocat", token: "token", name: null, avatarUrl: null }]);
  });
});

describe("githubConnectGhCli", () => {
  it("resolves the gh token, stores the identity, and makes it active", async () => {
    const result = await githubConnectGhCli(false, {
      execFn: async (f, a) => (f === "gh" && a[0] === "auth" ? "ghtoken" : ""),
      fetchFn: userFetch("clidev", { name: "CLI Dev", avatar_url: "https://avatars.githubusercontent.com/u/3" }),
    });
    expect(result).toEqual({ ok: true, data: { login: "clidev" } });
    expect(getConfigValue("cairn", "githubAccounts")).toEqual([
      { login: "clidev", token: "ghtoken", name: "CLI Dev", avatarUrl: "https://avatars.githubusercontent.com/u/3" },
    ]);
    expect(getConfigValue("cairn", "githubActiveLogin")).toBe("clidev");
  });

  it("errors when gh has no token", async () => {
    const result = await githubConnectGhCli(false, { execFn: async () => "", fetchFn: userFetch("clidev") });
    expect(result.ok).toBe(false);
  });

  it("errors when gh is not installed", async () => {
    const result = await githubConnectGhCli(false, { execFn: noGh, fetchFn: userFetch("clidev") });
    expect(result.ok).toBe(false);
  });

  it("errors when the resolved token fails validation", async () => {
    const result = await githubConnectGhCli(false, {
      execFn: async (f, a) => (f === "gh" && a[0] === "auth" ? "ghtoken" : ""),
      fetchFn: failFetch(401),
    });
    expect(result.ok).toBe(false);
    expect(getConfigValue("cairn", "githubAccounts")).toBeUndefined();
  });

  it("stars Cairn using the gh CLI token when star is true", async () => {
    const calls: { url: string; init?: { method?: string; headers?: Record<string, string> } }[] = [];
    const result = await githubConnectGhCli(true, {
      execFn: async (f, a) => (f === "gh" && a[0] === "auth" ? "ghtoken" : ""),
      fetchFn: spyFetch("clidev", calls),
    });
    expect(result.ok).toBe(true);
    const starCall = calls.find((c) => c.url === "https://api.github.com/user/starred/intisy-ai/cairn");
    expect(starCall).toBeDefined();
    expect(starCall?.init?.method).toBe("PUT");
  });

  it("does not star when star is false", async () => {
    const calls: { url: string }[] = [];
    const result = await githubConnectGhCli(false, {
      execFn: async (f, a) => (f === "gh" && a[0] === "auth" ? "ghtoken" : ""),
      fetchFn: spyFetch("clidev", calls),
    });
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.url.includes("/user/starred/"))).toBe(false);
  });

  it("still succeeds when starring fails", async () => {
    const calls: { url: string }[] = [];
    const result = await githubConnectGhCli(true, {
      execFn: async (f, a) => (f === "gh" && a[0] === "auth" ? "ghtoken" : ""),
      fetchFn: spyFetch("clidev", calls, "throw"),
    });
    expect(result.ok).toBe(true);
  });
});

describe("githubSwitchAccount", () => {
  it("makes a stored account active", async () => {
    await githubAddAccount("token-a", false, { fetchFn: userFetch("alice") });
    await githubAddAccount("token-b", false, { fetchFn: userFetch("bob") });
    const result = await githubSwitchAccount("alice");
    expect(result).toEqual({ ok: true, data: undefined });
    expect(getConfigValue("cairn", "githubActiveLogin")).toBe("alice");
  });

  it("errors on an unknown login", async () => {
    const result = await githubSwitchAccount("nobody");
    expect(result.ok).toBe(false);
  });
});

describe("githubRemoveAccount", () => {
  it("removes a stored account and reassigns the active login when it was active", async () => {
    await githubAddAccount("token-a", false, { fetchFn: userFetch("alice") });
    await githubAddAccount("token-b", false, { fetchFn: userFetch("bob") });
    const result = await githubRemoveAccount("bob");
    expect(result).toEqual({ ok: true, data: undefined });
    expect(getConfigValue("cairn", "githubAccounts")).toEqual([{ login: "alice", token: "token-a", name: null, avatarUrl: null }]);
    expect(getConfigValue("cairn", "githubActiveLogin")).toBe("alice");
  });

  it("clears the active login when the last account is removed", async () => {
    await githubAddAccount("token-a", false, { fetchFn: userFetch("alice") });
    await githubRemoveAccount("alice");
    const status = await githubStatus({ env: {}, execFn: noGh, fetchFn: userFetch("nobody") });
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.data.accounts).toEqual([]);
      expect(status.data.activeLogin).toBeNull();
    }
  });
});

describe("resolveToken", () => {
  it("resolves the active stored account's token as the config source", async () => {
    await githubAddAccount("token-a", false, { fetchFn: userFetch("alice") });
    await githubAddAccount("token-b", false, { fetchFn: userFetch("bob") });
    const resolved = await resolveToken({}, noGh);
    expect(resolved).toEqual({ token: "token-b", source: "config" });
  });

  it("still honors a legacy plain githubToken when no accounts are stored", async () => {
    setConfigValue("cairn", "githubToken", "legacy-token");
    const resolved = await resolveToken({}, noGh);
    expect(resolved).toEqual({ token: "legacy-token", source: "config" });
  });
});

describe("githubSetStar", () => {
  it("PUTs the repo's star endpoint when starred is true", async () => {
    await githubAddAccount("token", false, { fetchFn: userFetch("octocat") });
    const calls: { url: string; init?: { method?: string; headers?: Record<string, string> } }[] = [];
    const result = await githubSetStar("https://github.com/o/r", true, { fetchFn: spyFetch("octocat", calls) });
    expect(result).toEqual({ ok: true, data: undefined });
    const starCall = calls.find((c) => c.url === "https://api.github.com/user/starred/o/r");
    expect(starCall?.init?.method).toBe("PUT");
    expect(starCall?.init?.headers?.Authorization).toBe("Bearer token");
  });

  it("DELETEs the repo's star endpoint when starred is false", async () => {
    await githubAddAccount("token", false, { fetchFn: userFetch("octocat") });
    const calls: { url: string; init?: { method?: string } }[] = [];
    const result = await githubSetStar("https://github.com/o/r", false, { fetchFn: spyFetch("octocat", calls) });
    expect(result).toEqual({ ok: true, data: undefined });
    const starCall = calls.find((c) => c.url === "https://api.github.com/user/starred/o/r");
    expect(starCall?.init?.method).toBe("DELETE");
  });

  it("accepts owner/repo shorthand", async () => {
    await githubAddAccount("token", false, { fetchFn: userFetch("octocat") });
    const calls: { url: string }[] = [];
    await githubSetStar("o/r", true, { fetchFn: spyFetch("octocat", calls) });
    expect(calls.some((c) => c.url === "https://api.github.com/user/starred/o/r")).toBe(true);
  });

  it("does nothing (still ok) when there is no token", async () => {
    const calls: { url: string }[] = [];
    const result = await githubSetStar("https://github.com/o/r", true, {
      env: {},
      execFn: noGh,
      fetchFn: spyFetch("octocat", calls),
    });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(calls.length).toBe(0);
  });

  it("does nothing (still ok) when the url can't be parsed into an owner/repo", async () => {
    await githubAddAccount("token", false, { fetchFn: userFetch("octocat") });
    const calls: { url: string }[] = [];
    const result = await githubSetStar("not a repo url", true, { fetchFn: spyFetch("octocat", calls) });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(calls.length).toBe(0);
  });
});

describe("githubStatus cairn star state", () => {
  it("reports cairnStarred true when the star check returns 204", async () => {
    const result = await githubStatus({ env: { GITHUB_TOKEN: "t" }, execFn: noGh, fetchFn: spyFetch("octocat", []) });
    expect(result.ok && result.data.cairnStarred).toBe(true);
  });

  it("reports cairnStarred false when the star check returns 404", async () => {
    const notStarred = (async (url: string) =>
      url.includes("/user/starred/")
        ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ login: "octocat" }) }) as unknown as typeof fetch;
    const result = await githubStatus({ env: { GITHUB_TOKEN: "t" }, execFn: noGh, fetchFn: notStarred });
    expect(result.ok && result.data.cairnStarred).toBe(false);
    if (result.ok) expect(result.data.cairnRepoUrl).toBe("https://github.com/intisy-ai/cairn");
  });
});

describe("githubStarCairn", () => {
  it("stars Cairn via PUT with the active token", async () => {
    const calls: { url: string; init?: { method?: string } }[] = [];
    const result = await githubStarCairn(true, { env: { GITHUB_TOKEN: "t" }, execFn: noGh, fetchFn: spyFetch("octocat", calls) });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(calls.some((c) => c.url.includes("/user/starred/intisy-ai/cairn") && c.init?.method === "PUT")).toBe(true);
  });

  it("unstars Cairn via DELETE", async () => {
    const calls: { url: string; init?: { method?: string } }[] = [];
    await githubStarCairn(false, { env: { GITHUB_TOKEN: "t" }, execFn: noGh, fetchFn: spyFetch("octocat", calls) });
    expect(calls.some((c) => c.url.includes("/user/starred/intisy-ai/cairn") && c.init?.method === "DELETE")).toBe(true);
  });

  it("errors when there is no token to star with", async () => {
    const calls: { url: string }[] = [];
    const result = await githubStarCairn(true, { env: {}, execFn: noGh, fetchFn: spyFetch("octocat", calls) });
    expect(result.ok).toBe(false);
    expect(calls.length).toBe(0);
  });
});
