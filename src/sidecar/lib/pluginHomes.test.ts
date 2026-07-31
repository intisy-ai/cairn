import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appRealHome, pluginHomes } from "./pluginHomes.js";

describe("appRealHome", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("prefers ~/.claude and XDG opencode", () => {
    tempDir = mkdtempSync(join(tmpdir(), "plugin-homes-"));
    mkdirSync(join(tempDir, ".claude"));

    expect(appRealHome("claude", {}, tempDir).replaceAll("\\", "/")).toContain("/.claude");
    expect(appRealHome("opencode", { XDG_CONFIG_HOME: "/cfg" }, tempDir).replaceAll("\\", "/")).toBe("/cfg/opencode");
  });
});

describe("pluginHomes", () => {
  it("always lists cairn first (present, hasUpdater), then only detected apps", async () => {
    const homes = await pluginHomes({
      detect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      cairnDir: "/store",
      appHome: (app) => (app === "claude" ? "/home/claude" : "/home/opencode"),
      hasUpdater: () => true,
    });
    expect(homes[0]).toMatchObject({ id: "cairn", present: true, hasUpdater: true, dir: "/store" });
    expect(homes.map((h) => h.id)).toEqual(["cairn", "claude", "opencode"]);
    expect(homes.find((h) => h.id === "opencode")?.present).toBe(false);
  });

  it("hasUpdater reflects whether plugin-updater is actually installed in a home", async () => {
    const homes = await pluginHomes({
      detect: async () => ({ ok: true, data: { claude: true, opencode: true } }),
      cairnDir: "/store",
      appHome: (app) => (app === "claude" ? "/home/claude/.claude" : "/home/opencode"),
      hasUpdater: (dir) => dir.replaceAll("\\", "/").includes("/.claude"),
    });
    expect(homes.find((h) => h.id === "cairn")?.hasUpdater).toBe(false);
    expect(homes.find((h) => h.id === "claude")?.hasUpdater).toBe(true);
    expect(homes.find((h) => h.id === "opencode")?.hasUpdater).toBe(false);
  });
});
