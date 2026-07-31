import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigValue } from "@core/index.js";
import { resetOrgScanCache } from "../lib/orgScan.js";
import { githubStatus, githubSetToken } from "./github.js";

beforeEach(() => {
  resetOrgScanCache();
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-github-"));
});

const loginFetch = (login: string) =>
  (async () => ({ ok: true, status: 200, json: async () => ({ login }) })) as unknown as typeof fetch;

describe("githubStatus", () => {
  it("reports connected via an env token, with login from the GitHub API", async () => {
    const result = await githubStatus({ env: { GITHUB_TOKEN: "t" }, execFn: async () => "", fetchFn: loginFetch("octocat") });
    expect(result).toEqual({ ok: true, data: { source: "env", connected: true, login: "octocat", ghCliDetected: false } });
  });

  it("reports anonymous with no login when no token is available anywhere", async () => {
    const result = await githubStatus({
      env: {},
      execFn: async () => { throw new Error("gh not installed"); },
      fetchFn: (async () => { throw new Error("should not be called"); }) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true, data: { source: "anonymous", connected: false, login: null, ghCliDetected: false } });
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
      fetchFn: (async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true, data: { source: "env", connected: true, login: null, ghCliDetected: false } });
  });
});

describe("githubSetToken", () => {
  it("writes the trimmed token to Cairn config and resets the org-scan cache", async () => {
    const write = await githubSetToken("  pasted-token  ");
    expect(write).toEqual({ ok: true, data: undefined });
    expect(getConfigValue("cairn", "githubToken")).toBe("pasted-token");

    const status = await githubStatus({ env: {}, execFn: async () => { throw new Error("no gh"); }, fetchFn: loginFetch("octocat") });
    expect(status.ok).toBe(true);
    if (status.ok) expect(status.data.source).toBe("config");
  });

  it("clears the stored token when given an empty string, disconnecting", async () => {
    await githubSetToken("pasted-token");
    const cleared = await githubSetToken("");
    expect(cleared).toEqual({ ok: true, data: undefined });

    const status = await githubStatus({ env: {}, execFn: async () => { throw new Error("no gh"); }, fetchFn: loginFetch("octocat") });
    expect(status.ok).toBe(true);
    if (status.ok) expect(status.data).toEqual({ source: "anonymous", connected: false, login: null, ghCliDetected: false });
  });
});
