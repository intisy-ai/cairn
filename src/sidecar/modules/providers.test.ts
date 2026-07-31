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

function seedStubProvider(): void {
  const configDir = process.env.HUB_CONFIG_DIR as string;
  const repoDir = join(configDir, "repos", "stub-auth");
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

describe("providers sidecar module", () => {
  it("lists the catalog with account counts, active state, and default exposure", async () => {
    seedStubProvider();
    const { addAccount } = await import("@core-auth/index.js");
    addAccount("stub", { id: "a1", email: "a1@example.com", refresh: "r1", enabled: true });

    const { providersList, providersSetActive, providersSetExposure } = await import("./providers.js");

    const listed = await providersList();
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error("unreachable");
    expect(listed.data).toHaveLength(1);
    const row = listed.data[0];
    expect(row.id).toBe("stub");
    expect(row.label).toBe("Stub");
    expect(row.hasOAuth).toBe(true);
    expect(row.accountCount).toBe(1);
    expect(row.active).toBe(false);
    expect(row.exposure).toEqual({ claude: true, opencode: true });

    const exposed = await providersSetExposure("stub", "claude", false);
    expect(exposed.ok).toBe(true);
    const afterExposure = await providersList();
    if (!afterExposure.ok) throw new Error("unreachable");
    expect(afterExposure.data[0].exposure).toEqual({ claude: false, opencode: true });

    const activated = await providersSetActive("stub");
    expect(activated.ok).toBe(true);
    const afterActive = await providersList();
    if (!afterActive.ok) throw new Error("unreachable");
    expect(afterActive.data[0].active).toBe(true);
  });

  it("returns ok:true with an empty list when no providers are deployed", async () => {
    const { providersList } = await import("./providers.js");
    const result = await providersList();
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("providersSetExposure writes an app-id-keyed entry", async () => {
    const { providersSetExposure } = await import("./providers.js");
    await providersSetExposure("stub", "claude", false);
    const map = getConfigValue("dashboard-exposure", "map") as Record<string, Record<string, boolean>>;
    expect(map.stub.claude).toBe(false);
  });
});
