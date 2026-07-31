import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigValue, setConfigValue } from "@core/index.js";
import { resetOrgScanCache, resolveToken } from "../lib/orgScan.js";
import { githubStatus, githubAddAccount, githubSwitchAccount, githubRemoveAccount } from "./github.js";

beforeEach(() => {
  resetOrgScanCache();
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-github-"));
});

const loginFetch = (login: string) =>
  (async () => ({ ok: true, status: 200, json: async () => ({ login }) })) as unknown as typeof fetch;

const failFetch = (status: number) =>
  (async () => ({ ok: false, status, json: async () => ({}) })) as unknown as typeof fetch;

describe("githubStatus", () => {
  it("reports connected via an env token, with login from the GitHub API", async () => {
    const result = await githubStatus({ env: { GITHUB_TOKEN: "t" }, execFn: async () => "", fetchFn: loginFetch("octocat") });
    expect(result).toEqual({ ok: true, data: { source: "env", connected: true, login: "octocat", ghCliDetected: false, accounts: [], activeLogin: null } });
  });

  it("reports anonymous with no login when no token is available anywhere", async () => {
    const result = await githubStatus({
      env: {},
      execFn: async () => { throw new Error("gh not installed"); },
      fetchFn: (async () => { throw new Error("should not be called"); }) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true, data: { source: "anonymous", connected: false, login: null, ghCliDetected: false, accounts: [], activeLogin: null } });
  });

  it("flags the local gh CLI as detected even when a different source wins the token", async () => {
    const result = await githubStatus({
      env: { GITHUB_TOKEN: "t" },
      execFn: async (f, a) => (f === "gh" && a[0] === "auth" ? "ghtoken" : ""),
      fetchFn: loginFetch("octocat"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.source).toBe("env");
      expect(result.data.ghCliDetected).toBe(true);
    }
  });

  it("stays connected but reports a null login when the GitHub API call fails", async () => {
    const result = await githubStatus({
      env: { GITHUB_TOKEN: "t" },
      execFn: async () => "",
      fetchFn: failFetch(401),
    });
    expect(result).toEqual({ ok: true, data: { source: "env", connected: true, login: null, ghCliDetected: false, accounts: [], activeLogin: null } });
  });

  it("lists stored accounts and the active login", async () => {
    await githubAddAccount("token-a", { fetchFn: loginFetch("alice") });
    await githubAddAccount("token-b", { fetchFn: loginFetch("bob") });
    const status = await githubStatus({ env: {}, execFn: async () => { throw new Error("no gh"); }, fetchFn: loginFetch("bob") });
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.data.accounts).toEqual([{ login: "alice" }, { login: "bob" }]);
      expect(status.data.activeLogin).toBe("bob");
    }
  });
});

describe("githubAddAccount", () => {
  it("validates the token via the GitHub API, stores it, and makes it active", async () => {
    const result = await githubAddAccount("  new-token  ", { fetchFn: loginFetch("octocat") });
    expect(result).toEqual({ ok: true, data: { login: "octocat" } });
    expect(getConfigValue("cairn", "githubAccounts")).toEqual([{ login: "octocat", token: "new-token" }]);
    expect(getConfigValue("cairn", "githubActiveLogin")).toBe("octocat");
  });

  it("replaces an existing entry for the same login instead of duplicating it", async () => {
    await githubAddAccount("token-1", { fetchFn: loginFetch("octocat") });
    await githubAddAccount("token-2", { fetchFn: loginFetch("octocat") });
    expect(getConfigValue("cairn", "githubAccounts")).toEqual([{ login: "octocat", token: "token-2" }]);
  });

  it("rejects an invalid token and stores nothing", async () => {
    const result = await githubAddAccount("bad-token", { fetchFn: failFetch(401) });
    expect(result.ok).toBe(false);
    expect(getConfigValue("cairn", "githubAccounts")).toBeUndefined();
  });

  it("rejects a blank token without calling the network", async () => {
    const result = await githubAddAccount("   ", { fetchFn: (async () => { throw new Error("should not be called"); }) as unknown as typeof fetch });
    expect(result.ok).toBe(false);
  });
});

describe("githubSwitchAccount", () => {
  it("makes a stored account active", async () => {
    await githubAddAccount("token-a", { fetchFn: loginFetch("alice") });
    await githubAddAccount("token-b", { fetchFn: loginFetch("bob") });
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
    await githubAddAccount("token-a", { fetchFn: loginFetch("alice") });
    await githubAddAccount("token-b", { fetchFn: loginFetch("bob") });
    const result = await githubRemoveAccount("bob");
    expect(result).toEqual({ ok: true, data: undefined });
    expect(getConfigValue("cairn", "githubAccounts")).toEqual([{ login: "alice", token: "token-a" }]);
    expect(getConfigValue("cairn", "githubActiveLogin")).toBe("alice");
  });

  it("clears the active login when the last account is removed", async () => {
    await githubAddAccount("token-a", { fetchFn: loginFetch("alice") });
    await githubRemoveAccount("alice");
    const status = await githubStatus({ env: {}, execFn: async () => { throw new Error("no gh"); }, fetchFn: loginFetch("nobody") });
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.data.accounts).toEqual([]);
      expect(status.data.activeLogin).toBeNull();
    }
  });
});

describe("resolveToken", () => {
  it("resolves the active stored account's token as the config source", async () => {
    await githubAddAccount("token-a", { fetchFn: loginFetch("alice") });
    await githubAddAccount("token-b", { fetchFn: loginFetch("bob") });
    const resolved = await resolveToken({}, async () => { throw new Error("no gh"); });
    expect(resolved).toEqual({ token: "token-b", source: "config" });
  });

  it("still honors a legacy plain githubToken when no accounts are stored", async () => {
    setConfigValue("cairn", "githubToken", "legacy-token");
    const resolved = await resolveToken({}, async () => { throw new Error("no gh"); });
    expect(resolved).toEqual({ token: "legacy-token", source: "config" });
  });
});
