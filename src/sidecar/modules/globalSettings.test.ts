import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("globalSettings sidecar module", () => {
  it("returns the schema together with the values on disk", async () => {
    const home = mkdtempSync(join(tmpdir(), "dash-globalsettings-"));
    mkdirSync(join(home, "config"), { recursive: true });
    writeFileSync(join(home, "config", "settings.json"), JSON.stringify({ activityMinImpact: "debug" }), "utf8");
    vi.stubEnv("HUB_CONFIG_DIR", home);
    try {
      const { globalSettingsRead } = await import("./globalSettings.js");
      const result = await globalSettingsRead();
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.data.defaults.activityMinImpact).toBe("info");
      expect(result.data.current.activityMinImpact).toBe("debug");
      expect(result.data.fields.some((f) => f.key === "activityMaxBytes" && f.type === "number")).toBe(true);
      expect(result.data.fields.some((f) => f.key === "activityMinImpact" && f.type === "select")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("still returns the schema when the home has no settings file", async () => {
    const home = mkdtempSync(join(tmpdir(), "dash-globalsettings-empty-"));
    vi.stubEnv("HUB_CONFIG_DIR", home);
    try {
      const { globalSettingsRead } = await import("./globalSettings.js");
      const result = await globalSettingsRead({ read: () => ({}) });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.data.current).toEqual({});
      expect(result.data.fields.length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllEnvs();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("reports a failure instead of throwing when the schema cannot be read", async () => {
    const { globalSettingsRead } = await import("./globalSettings.js");
    const result = await globalSettingsRead({ schema: () => { throw new Error("no schema"); } });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("no schema");
  });
});
