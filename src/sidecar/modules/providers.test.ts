import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfigValue } from "@core/index.js";
import type { AppDescriptor } from "@core/index.js";

const stubHandlerPath = fileURLToPath(new URL("../../../../../providers/stub-auth/dist/handler.js", import.meta.url));

// exposureFor()/defaultExposure() (see lib/exposure.ts) key the exposure map by
// getApps() ids, which now come solely from the apps.json registry, so the
// "claude"/"opencode" exposure keys these tests assert need a seeded registry.
function appDescriptor(id: string, label: string): AppDescriptor {
  return {
    id,
    label,
    home: { candidates: ["/nonexistent/" + id] },
    detect: { binary: id, pkg: id },
    commandsSubdir: "commands",
    proxyPort: 0,
    integration: "native",
    wireFormat: "anthropic",
  };
}

beforeEach(() => {
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-providers-"));
  process.env.HUB_APPS_FILE = join(process.env.HUB_CONFIG_DIR, "apps.json");
  writeFileSync(
    process.env.HUB_APPS_FILE,
    JSON.stringify({ claude: appDescriptor("claude", "Claude Code"), opencode: appDescriptor("opencode", "OpenCode") }),
  );
});

function reposRoot(): string {
  return join(process.env.HUB_CONFIG_DIR as string, "repos");
}

function seedStubProvider(): void {
  const repoDir = join(reposRoot(), "stub-auth");
  mkdirSync(join(repoDir, "dist"), { recursive: true });
  writeFileSync(
    join(repoDir, "package.json"),
    JSON.stringify({
      name: "stub-auth",
      claudeHub: { authProviders: [{ name: "stub", handler: "dist/handler.js" }] },
    }),
  );
  copyFileSync(stubHandlerPath, join(repoDir, "dist", "handler.js"));
}

// Writes a minimal synthetic provider plugin whose def declares its own
// accountPool, so two of these (see below) can simulate a shared pool without
// depending on stub-auth's real handler shape.
function seedSyntheticProvider(repo: string, providerId: string, label: string, accountPool: string): void {
  const repoDir = join(reposRoot(), repo);
  mkdirSync(join(repoDir, "dist"), { recursive: true });
  writeFileSync(
    join(repoDir, "package.json"),
    JSON.stringify({
      name: repo,
      claudeHub: { authProviders: [{ name: providerId, handler: "dist/handler.js" }] },
    }),
  );
  writeFileSync(
    join(repoDir, "dist", "handler.js"),
    `export const def = { id: ${JSON.stringify(providerId)}, label: ${JSON.stringify(label)}, models: {}, hasOAuth: false, accountPool: ${JSON.stringify(accountPool)} };\n`,
  );
}

describe("providers sidecar module", () => {
  it("lists the catalog with account counts, auth kind, and default exposure", async () => {
    seedStubProvider();
    const { addAccount } = await import("@core-auth/index.js");
    addAccount("stub", { id: "a1", email: "a1@example.com", refresh: "r1", enabled: true });

    const { providersList, providersSetEnabled, providersSetExposure } = await import("./providers.js");

    const listed = await providersList();
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error("unreachable");
    expect(listed.data).toHaveLength(1);
    const row = listed.data[0];
    expect(row.id).toBe("stub");
    expect(row.label).toBe("Stub");
    expect(row.authKind).toBe("oauth");
    expect(row.accountCount).toBe(1);
    expect(row.enabled).toBe(true);
    expect(row.exposure).toEqual({ claude: true, opencode: true });
    expect(row.accountPool).toBe("stub");
    expect(row.sharedWith).toEqual([]);
    expect(row.pluginName).toBe("stub-auth");

    const exposed = await providersSetExposure("stub", "claude", false);
    expect(exposed.ok).toBe(true);
    const afterExposure = await providersList();
    if (!afterExposure.ok) throw new Error("unreachable");
    expect(afterExposure.data[0].exposure).toEqual({ claude: false, opencode: true });
    // still enabled: it is exposed to opencode
    expect(afterExposure.data[0].enabled).toBe(true);

    const disabled = await providersSetEnabled("stub", false);
    expect(disabled.ok).toBe(true);
    const afterDisabled = await providersList();
    if (!afterDisabled.ok) throw new Error("unreachable");
    expect(afterDisabled.data[0].exposure).toEqual({ claude: false, opencode: false });
    expect(afterDisabled.data[0].enabled).toBe(false);

    const enabled = await providersSetEnabled("stub", true);
    expect(enabled.ok).toBe(true);
    const afterEnabled = await providersList();
    if (!afterEnabled.ok) throw new Error("unreachable");
    expect(afterEnabled.data[0].exposure).toEqual({ claude: true, opencode: true });
    expect(afterEnabled.data[0].enabled).toBe(true);
  });

  it("returns ok:true with an empty list when no providers are deployed", async () => {
    const { providersList } = await import("./providers.js");
    const result = await providersList();
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("cross-links providers that declare the same accountPool and shows them the same accountCount", async () => {
    seedSyntheticProvider("plugin-a", "providerA", "Provider A", "shared-pool");
    seedSyntheticProvider("plugin-b", "providerB", "Provider B", "shared-pool");
    const { addAccount } = await import("@core-auth/index.js");
    addAccount("shared-pool", { id: "acc1", email: "acc1@example.com", refresh: "r1", enabled: true });

    const { providersList } = await import("./providers.js");
    const listed = await providersList();
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error("unreachable");
    expect(listed.data).toHaveLength(2);

    const rowA = listed.data.find((r) => r.id === "providerA");
    const rowB = listed.data.find((r) => r.id === "providerB");
    expect(rowA).toBeDefined();
    expect(rowB).toBeDefined();
    if (!rowA || !rowB) throw new Error("unreachable");

    expect(rowA.accountPool).toBe("shared-pool");
    expect(rowB.accountPool).toBe("shared-pool");
    expect(rowA.sharedWith).toEqual(["providerB"]);
    expect(rowB.sharedWith).toEqual(["providerA"]);
    expect(rowA.accountCount).toBe(1);
    expect(rowB.accountCount).toBe(1);
    expect(rowA.pluginName).toBe("plugin-a");
    expect(rowB.pluginName).toBe("plugin-b");
  });

  it("providersSetExposure writes an app-id-keyed entry", async () => {
    const { providersSetExposure } = await import("./providers.js");
    await providersSetExposure("stub", "claude", false);
    const map = getConfigValue("dashboard-exposure", "map") as Record<string, Record<string, boolean>>;
    expect(map.stub.claude).toBe(false);
  });

  it("providersSetEnabled(false) does not affect an unrelated provider's exposure", async () => {
    const { providersSetExposure, providersSetEnabled } = await import("./providers.js");
    await providersSetExposure("other", "claude", true);
    await providersSetEnabled("stub", false);
    const map = getConfigValue("dashboard-exposure", "map") as Record<string, Record<string, boolean>>;
    expect(map.other.claude).toBe(true);
  });
});
