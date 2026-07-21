import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const stubHandlerPath = fileURLToPath(new URL("../../../../../providers/stub-auth/dist/handler.js", import.meta.url));

beforeEach(() => {
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-providers-"));
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
    expect(row.exposure).toEqual({ cc: true, oc: true });

    const exposed = await providersSetExposure("stub", "cc", false);
    expect(exposed.ok).toBe(true);
    const afterExposure = await providersList();
    if (!afterExposure.ok) throw new Error("unreachable");
    expect(afterExposure.data[0].exposure).toEqual({ cc: false, oc: true });

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
});
