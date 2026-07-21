import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

beforeEach(() => {
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-overview-"));
});

describe("overview sidecar module", () => {
  it("summarizes deployed providers, accounts, and server state", async () => {
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
    writeFileSync(join(repoDir, "dist", "handler.js"), "export {};\n");

    const { addAccount } = await import("@core-auth/index.js");
    addAccount("stub", { id: "acc1" });

    const { overviewSummary } = await import("./overview.js");
    expect(await overviewSummary(async () => false)).toEqual({
      ok: true,
      data: { providersConnected: 1, accountsTotal: 1, serverRunning: false, serverPort: 34567 },
    });
  });
});
