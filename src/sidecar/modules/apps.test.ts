import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appsDetect, appsInstallCli, appsInit, appsUninstallCli, appsSummary } from "./apps.js";

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
  });

  it("returns an empty summary when there is no accounts.json or plugins.json", async () => {
    const result = await appsSummary("opencode", { appHome: () => tempHome });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.accounts).toEqual([]);
    expect(result.data.pluginCount).toBe(0);
    expect(result.data.configDir).toBe(tempHome);
  });

  it("returns an error for an unknown app", async () => {
    const result = await appsSummary("bogus" as never, { appHome: () => tempHome });
    expect(result.ok).toBe(false);
  });
});
