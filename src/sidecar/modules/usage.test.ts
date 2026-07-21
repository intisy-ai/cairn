import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const stubHandlerPath = fileURLToPath(new URL("../../../../../providers/stub-auth/dist/handler.js", import.meta.url));

beforeEach(() => {
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-usage-"));
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

describe("usage sidecar module", () => {
  it("summarizes deployed-provider accounts with empty sessions/models", async () => {
    seedStubProvider();
    const { addAccount } = await import("@core-auth/index.js");
    addAccount("stub", { id: "a1", email: "a1@example.com", refresh: "r1", enabled: true });

    const { usageSnapshot } = await import("./usage.js");
    const result = await usageSnapshot();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.accounts).toHaveLength(1);
    expect(result.data.accounts[0]).toEqual({ provider: "stub", id: "a1" });
    expect(result.data.sessions).toEqual([]);
    expect(result.data.models).toEqual({});
    expect(typeof result.data.updatedAt).toBe("string");
    expect(result.data.updatedAt.length).toBeGreaterThan(0);
  });

  it("returns ok:true with an empty accounts list when no providers are deployed", async () => {
    const { usageSnapshot } = await import("./usage.js");
    const result = await usageSnapshot();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.accounts).toEqual([]);
  });
});
