import { describe, it, expect, vi } from "vitest";
import type { AppPresence } from "../../../packages/shared/src/domain.js";

const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn((p: string) => p.replaceAll("\\", "/").endsWith("/.claude")),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: mockFs.existsSync,
    writeFileSync: mockFs.writeFileSync,
    readFileSync: mockFs.readFileSync,
  };
});

const { appRealHome, pluginHomes } = await import("./pluginHomes.js");

describe("appRealHome", () => {
  it("prefers ~/.claude and XDG opencode", () => {
    expect(appRealHome("claude", {}, "/home/u").replaceAll("\\", "/")).toContain("/home/u/.claude");
    expect(appRealHome("opencode", { XDG_CONFIG_HOME: "/cfg" }, "/home/u").replaceAll("\\", "/")).toBe("/cfg/opencode");
  });
});

describe("pluginHomes", () => {
  it("always lists cairn first (present, hasUpdater), then only detected apps", async () => {
    const homes = await pluginHomes({
      detect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      cairnDir: "/store",
      exists: () => true,
    });
    expect(homes[0]).toMatchObject({ id: "cairn", present: true, hasUpdater: true, dir: "/store" });
    expect(homes.map((h) => h.id)).toEqual(["cairn", "claude", "opencode"]);
    expect(homes.find((h) => h.id === "opencode")?.present).toBe(false);
  });

  it("hasUpdater for an app home means its plugins.json exists", async () => {
    const homes = await pluginHomes({
      detect: async () => ({ ok: true, data: { claude: true, opencode: true } }),
      cairnDir: "/store",
      exists: (p) => p.replaceAll("\\", "/").includes("/.claude/"),
    });
    expect(homes.find((h) => h.id === "claude")?.hasUpdater).toBe(true);
    expect(homes.find((h) => h.id === "opencode")?.hasUpdater).toBe(false);
  });
});
