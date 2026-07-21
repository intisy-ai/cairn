import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

beforeEach(() => {
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-cfg-"));
});

describe("config sidecar module", () => {
  it("round-trips a config value through the reused core writer", async () => {
    const { configGet, configSet } = await import("./config.js");
    expect(await configSet("dashboard", "theme", "dark")).toEqual({ ok: true, data: undefined });
    expect(await configGet("dashboard", "theme")).toEqual({ ok: true, data: "dark" });
  });
});
