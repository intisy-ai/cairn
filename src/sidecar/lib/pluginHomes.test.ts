import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appRealHome, pluginHomes, loaderInstalled } from "./pluginHomes.js";
import type { AppDescriptor } from "@core/index.js";

// getApps()/getAppDescriptor() now read solely from the apps.json registry (see
// libs/core/src/apps.ts), so tests exercising real descriptor lookups need a
// seeded registry instead of relying on a builtin claude/opencode app list.
const claudeApp: AppDescriptor = {
  id: "claude",
  label: "Claude Code",
  home: { candidates: ["~/.claude"] },
  detect: { binary: "claude", pkg: "claude-code" },
  commandsSubdir: "commands",
  proxyPort: 41101,
  integration: "native",
  wireFormat: "anthropic",
};

const opencodeApp: AppDescriptor = {
  id: "opencode",
  label: "OpenCode",
  home: { xdgSubdir: "opencode", candidates: ["~/.config/opencode"] },
  detect: { binary: "opencode", pkg: "opencode-ai" },
  commandsSubdir: "command",
  proxyPort: 41102,
  integration: "native",
  wireFormat: "anthropic",
};

let appsRegistryDir: string;
let savedHubAppsFile: string | undefined;

beforeEach(() => {
  appsRegistryDir = mkdtempSync(join(tmpdir(), "plugin-homes-registry-"));
  savedHubAppsFile = process.env.HUB_APPS_FILE;
  process.env.HUB_APPS_FILE = join(appsRegistryDir, "apps.json");
  writeFileSync(process.env.HUB_APPS_FILE, JSON.stringify({ claude: claudeApp, opencode: opencodeApp }));
});

afterEach(() => {
  rmSync(appsRegistryDir, { recursive: true, force: true });
  if (savedHubAppsFile === undefined) delete process.env.HUB_APPS_FILE;
  else process.env.HUB_APPS_FILE = savedHubAppsFile;
});

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
    // appRealHome is called with an explicit env object (not process.env) below,
    // so getAppDescriptor falls back to the home-relative apps.json default path.
    mkdirSync(join(tempDir, ".config", "cairn"), { recursive: true });
    writeFileSync(join(tempDir, ".config", "cairn", "apps.json"), JSON.stringify({ claude: claudeApp, opencode: opencodeApp }));

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

  // The app list offers a home as an install target only when its loader can load what lands there.
  it("reports whether each app's own loader is installed", async () => {
    writeFileSync(process.env.HUB_APPS_FILE!, JSON.stringify({
      claude: { ...claudeApp, loader: { id: "claude-code-loader", url: "https://example.test/claude-code-loader" } },
      opencode: { ...opencodeApp, loader: { id: "opencode-loader", url: "https://example.test/opencode-loader" } },
    }));
    const homes = await pluginHomes({
      detect: async () => ({ ok: true, data: { claude: true, opencode: true } }),
      cairnDir: "/store",
      appHome: (app) => "/home/" + app,
      hasUpdater: () => true,
      hasLoader: (dir, loaderId) => !!loaderId && dir === "/home/claude",
    });
    expect(homes.find((h) => h.id === "claude")?.loaderInstalled).toBe(true);
    expect(homes.find((h) => h.id === "opencode")?.loaderInstalled).toBe(false);
    // Cairn has no loader to install, so it never claims one.
    expect(homes.find((h) => h.id === "cairn")?.loaderInstalled).toBeUndefined();
  });
});

describe("loaderInstalled", () => {
  it("is false for a home whose app declares no loader", async () => {
    expect(await loaderInstalled("/home/x", undefined, async () => [{ name: "anything" }] as never)).toBe(false);
  });

  it("is true only when the home lists that exact loader", async () => {
    const list = async () => [{ name: "opencode-loader" }, { name: "wakatime-sync" }] as never;
    expect(await loaderInstalled("/home/o", "opencode-loader", list)).toBe(true);
    expect(await loaderInstalled("/home/o", "claude-code-loader", list)).toBe(false);
  });

  // A home we cannot read is not evidence of an install, and must not throw into the caller.
  it("reads an unreadable home as not installed", async () => {
    expect(await loaderInstalled("/gone", "opencode-loader", () => { throw new Error("ENOENT"); })).toBe(false);
  });
});
