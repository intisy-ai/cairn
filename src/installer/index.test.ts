import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UpdateCache } from "@intisy-ai/plugin-updater/dist/cache.js";

const FAKE_HEAD = "a".repeat(40);
vi.mock("@intisy-ai/plugin-updater/dist/git.js", () => ({ getLocalHead: () => FAKE_HEAD }));

function seedCache(homeDir: string, cache: UpdateCache): void {
  mkdirSync(join(homeDir, "cache"), { recursive: true });
  writeFileSync(join(homeDir, "cache", "plugin-updates.json"), JSON.stringify(cache), "utf8");
}

function readCache(homeDir: string): UpdateCache {
  return JSON.parse(readFileSync(join(homeDir, "cache", "plugin-updates.json"), "utf8")) as UpdateCache;
}

describe("recordInstalledVersion", () => {
  it("carries a previously detected experimentalAvailable forward instead of resetting it to null", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "cairn-installer-"));
    seedCache(homeDir, {
      checkedAt: "2026-08-01T00:00:00.000Z",
      plugins: {
        demo: {
          kind: "git",
          installedVersion: "v1.0.0",
          localHead: "b".repeat(40),
          remoteHead: "b".repeat(40),
          latestVersion: "v1.0.0",
          updateAvailable: false,
          experimentalAvailable: true,
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      },
    });

    const { recordInstalledVersion } = await import("./index.js");
    await recordInstalledVersion({
      jobId: "job-1",
      kind: "update",
      plugin: "demo",
      url: "https://example/demo",
      home: "claude",
      homeDir,
      isPluginManager: false,
      autoUpdate: true,
    });

    const entry = readCache(homeDir).plugins.demo;
    expect(entry.experimentalAvailable).toBe(true);
    expect(entry.localHead).toBe(FAKE_HEAD);
  });
});
