import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtureRoutingProfile } from "./routingProfileFixture.js";

beforeEach(() => {
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-modelmapwrite-"));
});

describe("modelMapWrite", () => {
  it("persists a chain to a slot, then removes the slot when written empty", async () => {
    const { modelMapWrite } = await import("./modelMapWrite.js");
    const { readModelMap } = await import("@intisy-ai/basekit/proxy");
    const configDir = process.env.HUB_CONFIG_DIR as string;
    const profile = fixtureRoutingProfile();

    modelMapWrite(configDir, profile, "opus", [{ provider: "stub", model: "m" }]);
    expect(readModelMap(configDir, profile)).toEqual({ opus: [{ provider: "stub", model: "m" }] });

    modelMapWrite(configDir, profile, "opus", []);
    expect(readModelMap(configDir, profile)).toEqual({});
  });
});
