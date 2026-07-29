import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigValue, setConfigValue } from "@core/index.js";
import type { LoadedProxyDef } from "../lib/proxyPlugins.js";

async function fakeDefs(): Promise<LoadedProxyDef[]> {
  const { anthropicProfile } = await import("@claude-code-proxy/index.js");
  return [{ app: "claude", label: "Claude Code", profile: anthropicProfile }];
}
const proxyDeps = { defs: fakeDefs };

function deployStubProvider(configDir: string): void {
  const repo = join(configDir, "repos", "stub-auth");
  mkdirSync(repo, { recursive: true });
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify({ claudeHub: { authProviders: [{ name: "stub", handler: "dist/index.js" }] } }),
  );
}

function seedAppHome(homeDir: string): void {
  const configDir = join(homeDir, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "accounts.json"),
    JSON.stringify({
      version: 1,
      providers: {
        stub: {
          accounts: [{ id: "acc-1", email: "acc-1@example.com", refresh: "r1", enabled: true }],
          activeIndex: 0,
          activeIndexByLane: {},
        },
      },
    }),
  );
  writeFileSync(
    join(configDir, "claude-code-loader.json"),
    JSON.stringify({ modelMap: { opus: [{ provider: "stub", model: "m-opus" }] } }),
  );
}

beforeEach(() => {
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-import-"));
});

describe("import", () => {
  it("reports importable apps with hasConfig flags", async () => {
    const { importApps } = await import("./import.js");
    const r = await importApps();
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.isArray(r.data)).toBe(true);
  });

  it("reports hasConfig:false for an app whose injected home does not exist", async () => {
    const { importApps } = await import("./import.js");
    const missingHome = join(process.env.HUB_CONFIG_DIR!, "nowhere");
    const r = await importApps({ appHome: () => missingHome });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.data.every((a) => a.hasConfig === false)).toBe(true);
  });

  it("imports accounts and routing from the app's real home into Cairn's own store", async () => {
    deployStubProvider(process.env.HUB_CONFIG_DIR!);
    const appHomeDir = mkdtempSync(join(tmpdir(), "dash-import-app-home-"));
    seedAppHome(appHomeDir);

    const { importRun } = await import("./import.js");
    const result = await importRun("claude", undefined, { appHome: () => appHomeDir, proxyDeps });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.accounts).toBeGreaterThanOrEqual(1);
    expect(result.data.providers).toBe(1);
    expect(result.data.routingImported).toBe(true);

    const { listAccounts, getConfigDir } = await import("@core-auth/index.js");
    const imported = listAccounts("stub", undefined) as { id: string }[];
    expect(imported.some((a) => a.id === "acc-1")).toBe(true);

    const { resolveModelMap } = await import("@core-proxy/model-map.js");
    const { profileFor } = await import("../lib/proxyRegistry.js");
    const profile = await profileFor("claude", proxyDeps);
    if (!profile) throw new Error("unreachable");
    const map = resolveModelMap(getConfigDir(), profile);
    expect(map.opus).toEqual([{ provider: "stub", model: "m-opus", name: "m-opus", derived: false }]);

    const { getConfigValue } = await import("@core/index.js");
    const exposure = getConfigValue("dashboard-exposure", "map") as Record<string, { claude: boolean }>;
    expect(exposure.stub.claude).toBe(true);
  });

  it("previews accounts, routing slots, and exposable providers without writing", async () => {
    deployStubProvider(process.env.HUB_CONFIG_DIR!);
    const appHomeDir = mkdtempSync(join(tmpdir(), "dash-import-app-home-"));
    seedAppHome(appHomeDir);

    const { importPreview } = await import("./import.js");
    const result = await importPreview("claude", { appHome: () => appHomeDir, proxyDeps });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.accounts).toBe(1);
    expect(result.data.exposedProviders).toBeGreaterThanOrEqual(1);
    expect(result.data.routingSlots).toBe(2);
  });

  it("skips categories that are not selected", async () => {
    deployStubProvider(process.env.HUB_CONFIG_DIR!);
    const appHomeDir = mkdtempSync(join(tmpdir(), "dash-import-app-home-"));
    seedAppHome(appHomeDir);

    const { importRun } = await import("./import.js");
    const result = await importRun("claude", { accounts: false, routing: true, exposure: true }, { appHome: () => appHomeDir, proxyDeps });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.accounts).toBe(0);
    expect(result.data.notes.some((n) => n.toLowerCase().includes("account") && n.toLowerCase().includes("skip"))).toBe(true);
  });

  it("migrates legacy cc/oc exposure entries when running the import-exposure path", async () => {
    deployStubProvider(process.env.HUB_CONFIG_DIR!);
    const appHomeDir = mkdtempSync(join(tmpdir(), "dash-import-app-home-"));
    seedAppHome(appHomeDir);
    setConfigValue("dashboard-exposure", "map", { someProvider: { cc: true, oc: false } });

    const { importRun } = await import("./import.js");
    const result = await importRun("claude", { accounts: false, routing: false, exposure: true }, { appHome: () => appHomeDir, proxyDeps });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const map = getConfigValue("dashboard-exposure", "map") as Record<string, Record<string, boolean>>;
    expect(map.someProvider).toEqual({ claude: true, opencode: false });
    expect(map.someProvider.cc).toBeUndefined();
    expect(map.someProvider.oc).toBeUndefined();
    expect(map.stub.claude).toBe(true);
  });
});
