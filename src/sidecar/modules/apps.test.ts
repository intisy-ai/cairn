import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appsDetect, appsInstallCli, appsInit, appsUninstallCli, appsSummary, appsConnection, appsInstallLoader } from "./apps.js";
import type { AppDescriptor } from "@core/index.js";

function descWithLoader(loaderId: string): AppDescriptor {
  return { loader: { id: loaderId, url: `org/${loaderId}` } } as unknown as AppDescriptor;
}

const loaderUrl = (loaderId: string): string => `org/${loaderId}`;

describe("apps sidecar module", () => {
  it("detects claude present via binary and opencode absent", async () => {
    const result = await appsDetect({
      binaryExists: (name) => name === "claude",
      fsExists: () => false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual({ claude: true, opencode: false });
  });

  it("detects opencode present via config dir when no binary is on PATH", async () => {
    const result = await appsDetect({
      binaryExists: () => false,
      fsExists: (path) => path.includes("opencode"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual({ claude: false, opencode: true });
  });

  it("reports both absent when neither the binary nor the config dir is found", async () => {
    const result = await appsDetect({ binaryExists: () => false, fsExists: () => false });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual({ claude: false, opencode: false });
  });

  it("installs the claude-code npm package as an arg-array spawn, not a shell string", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = async (file: string, args: string[]) => {
      calls.push({ file, args });
      return { stdout: "installed", stderr: "" };
    };
    const result = await appsInstallCli("claude", fakeSpawn);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual({ stdout: "installed", stderr: "" });
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe("npm");
    expect(calls[0].args).toEqual(["install", "-g", "@anthropic-ai/claude-code"]);
  });

  it("installs the opencode-ai npm package as an arg-array spawn", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = async (file: string, args: string[]) => {
      calls.push({ file, args });
      return { stdout: "", stderr: "" };
    };
    const result = await appsInstallCli("opencode", fakeSpawn);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe("npm");
    expect(calls[0].args).toContain("opencode-ai");
  });

  it("returns an error for an unknown app instead of spawning", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = async (file: string, args: string[]) => {
      calls.push({ file, args });
      return { stdout: "", stderr: "" };
    };
    const result = await appsInstallCli("bogus" as never, fakeSpawn);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("runs plugin-updater init for the given app as an arg-array spawn", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = async (file: string, args: string[]) => {
      calls.push({ file, args });
      return { stdout: "", stderr: "" };
    };
    const result = await appsInit("opencode", fakeSpawn);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe("npx");
    expect(calls[0].args).toEqual(["plugin-updater", "init", "--app", "opencode"]);
  });

  it("returns an error for an unknown app on init instead of spawning", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = async (file: string, args: string[]) => {
      calls.push({ file, args });
      return { stdout: "", stderr: "" };
    };
    const result = await appsInit("bogus" as never, fakeSpawn);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("appsUninstallCli", () => {
  it("uninstalls the CLI package and keeps data by default", async () => {
    const spawned: string[][] = [];
    const removed: string[] = [];
    const result = await appsUninstallCli("claude", false, {
      spawn: async (f, a) => {
        spawned.push([f, ...a]);
        return { stdout: "", stderr: "" };
      },
      rm: (p) => removed.push(p),
      appHome: () => "/fake/claude-home",
    });
    expect(result.ok).toBe(true);
    expect(spawned[0]).toEqual(["npm", "uninstall", "-g", "@anthropic-ai/claude-code"]);
    expect(removed).toEqual([]);
  });

  it("wipes the app home when asked", async () => {
    const removed: string[] = [];
    const result = await appsUninstallCli("opencode", true, {
      spawn: async () => ({ stdout: "", stderr: "" }),
      rm: (p) => removed.push(p),
      appHome: () => "/fake/oc-home",
    });
    expect(result.ok).toBe(true);
    expect(removed).toEqual(["/fake/oc-home"]);
  });

  it("returns an error for an unknown app instead of spawning or removing", async () => {
    const spawned: string[][] = [];
    const removed: string[] = [];
    const result = await appsUninstallCli("bogus" as never, true, {
      spawn: async (f, a) => {
        spawned.push([f, ...a]);
        return { stdout: "", stderr: "" };
      },
      rm: (p) => removed.push(p),
    });
    expect(result.ok).toBe(false);
    expect(spawned).toHaveLength(0);
    expect(removed).toHaveLength(0);
  });
});

describe("appsSummary", () => {
  let tempHome: string;
  let tempCairnDir: string;
  let savedHubConfigDir: string | undefined;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), "apps-summary-home-"));
    mkdirSync(join(tempHome, "config"), { recursive: true });
    tempCairnDir = mkdtempSync(join(tmpdir(), "apps-summary-cairn-"));
    savedHubConfigDir = process.env.HUB_CONFIG_DIR;
    process.env.HUB_CONFIG_DIR = tempCairnDir;
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempCairnDir, { recursive: true, force: true });
    if (savedHubConfigDir === undefined) delete process.env.HUB_CONFIG_DIR;
    else process.env.HUB_CONFIG_DIR = savedHubConfigDir;
  });

  it("summarizes accounts, plugin count, and config dir from the app home", async () => {
    writeFileSync(
      join(tempHome, "config", "accounts.json"),
      JSON.stringify({
        providers: {
          antigravity: {
            accounts: [
              { id: "acc-1", email: "a@example.com", enabled: true, meta: { cachedQuota: { pool: { remainingFraction: 0.62 } } } },
            ],
          },
          "claude-code": { accounts: [{ id: "acct-2", enabled: false }] },
        },
      }),
      "utf8",
    );
    writeFileSync(
      join(tempHome, "config", "plugins.json"),
      JSON.stringify(
        [
          { name: "plugin-a", url: "https://github.com/intisy-ai/plugin-a", enabled: true },
          { name: "plugin-b", url: "https://github.com/intisy-ai/plugin-b", enabled: true },
        ],
        null,
        2,
      ),
      "utf8",
    );

    const result = await appsSummary("claude", { appHome: () => tempHome });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.configDir).toBe(tempHome);
    expect(result.data.pluginCount).toBe(2);
    expect(result.data.accounts).toEqual([
      { provider: "antigravity", label: "a@example.com", enabled: true, quotaPct: 62 },
      { provider: "claude-code", label: "acct-2", enabled: false, quotaPct: null },
    ]);
    expect(result.data.providerCount).toBe(2);
    expect(result.data.accountsEnabled).toBe(1);
    expect(result.data.providerBreakdown).toEqual([
      { provider: "antigravity", accounts: 1, enabled: 1 },
      { provider: "claude-code", accounts: 1, enabled: 0 },
    ]);
    expect(result.data.quotaMinPct).toBe(62);
  });

  it("aggregates provider breakdown sorted by accounts desc and the lowest reported quota", async () => {
    writeFileSync(
      join(tempHome, "config", "accounts.json"),
      JSON.stringify({
        providers: {
          antigravity: {
            accounts: [
              { id: "acc-1", email: "a@example.com", enabled: true, meta: { cachedQuota: { pool: { remainingFraction: 0.62 } } } },
              { id: "acc-2", email: "b@example.com", enabled: true, meta: { cachedQuota: { pool: { remainingFraction: 0.2 } } } },
            ],
          },
          "claude-code": {
            accounts: [{ id: "acc-3", enabled: false }],
          },
        },
      }),
      "utf8",
    );

    const result = await appsSummary("claude", { appHome: () => tempHome });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.providerCount).toBe(2);
    expect(result.data.accountsEnabled).toBe(2);
    expect(result.data.providerBreakdown).toEqual([
      { provider: "antigravity", accounts: 2, enabled: 2 },
      { provider: "claude-code", accounts: 1, enabled: 0 },
    ]);
    expect(result.data.quotaMinPct).toBe(20);
  });

  it("returns an empty summary when there is no accounts.json or plugins.json", async () => {
    const result = await appsSummary("opencode", { appHome: () => tempHome });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.accounts).toEqual([]);
    expect(result.data.pluginCount).toBe(0);
    expect(result.data.configDir).toBe(tempHome);
    expect(result.data.providerCount).toBe(0);
    expect(result.data.accountsEnabled).toBe(0);
    expect(result.data.providerBreakdown).toEqual([]);
    expect(result.data.quotaMinPct).toBeNull();
  });

  it("returns an error for an unknown app", async () => {
    const result = await appsSummary("bogus" as never, { appHome: () => tempHome });
    expect(result.ok).toBe(false);
  });

  it("reports cli presence and a loader installed in the app home", async () => {
    const result = await appsConnection("app1", {
      getDescriptor: () => descWithLoader("app1-loader"),
      detect: async () => ({ ok: true, data: { app1: true } }),
      appHome: (app) => `/home/${app}`,
      listPlugins: (dir) => (dir === "/home/app1" ? [{ name: "app1-loader" } as never] : []),
    });
    expect(result).toEqual({ ok: true, data: { app: "app1", cliPresent: true, loaderId: "app1-loader", loaderUrl: loaderUrl("app1-loader"), loaderInstalled: true } });
  });

  it("reports the loader not installed when its plugin is absent from the home", async () => {
    const result = await appsConnection("app1", {
      getDescriptor: () => descWithLoader("app1-loader"),
      detect: async () => ({ ok: true, data: { app1: false } }),
      appHome: () => "/home/app1",
      listPlugins: () => [],
    });
    expect(result).toEqual({ ok: true, data: { app: "app1", cliPresent: false, loaderId: "app1-loader", loaderUrl: loaderUrl("app1-loader"), loaderInstalled: false } });
  });

  it("reports loaderId null for an app that declares no loader", async () => {
    const result = await appsConnection("app1", {
      getDescriptor: () => ({} as unknown as AppDescriptor),
      detect: async () => ({ ok: true, data: { app1: true } }),
      appHome: () => "/home/app1",
      listPlugins: () => [{ name: "unrelated" } as never],
    });
    expect(result).toEqual({ ok: true, data: { app: "app1", cliPresent: true, loaderId: null, loaderUrl: null, loaderInstalled: false } });
  });

  it("appsConnection errors for an unknown app", async () => {
    const result = await appsConnection("nope", { getDescriptor: () => undefined });
    expect(result.ok).toBe(false);
  });

  it("installs the loader into the app home using the descriptor id and url", async () => {
    const calls: Array<[string, string, string]> = [];
    const result = await appsInstallLoader("app1", {
      getDescriptor: () => descWithLoader("app1-loader"),
      install: async (home, name, url) => { calls.push([home, name, url]); return { ok: true, data: undefined }; },
    });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([["app1", "app1-loader", "org/app1-loader"]]);
  });

  it("appsInstallLoader errors when the app declares no loader", async () => {
    const result = await appsInstallLoader("app1", { getDescriptor: () => ({} as unknown as AppDescriptor) });
    expect(result.ok).toBe(false);
  });

  it("appsInstallLoader propagates an install failure", async () => {
    const result = await appsInstallLoader("app1", {
      getDescriptor: () => descWithLoader("app1-loader"),
      install: async () => ({ ok: false, error: "boom" }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("boom");
  });
});
