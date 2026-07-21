import { describe, it, expect } from "vitest";
import { appsDetect, appsInstallCli, appsInit } from "./apps.js";

describe("apps sidecar module", () => {
  it("detects claude present via binary and opencode absent", async () => {
    const result = await appsDetect({
      binaryExists: (name) => name === "claude",
      fsExists: () => false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual({ claude: true, opencode: false });
  });

  it("detects opencode present via config dir when no binary is on PATH", async () => {
    const result = await appsDetect({
      binaryExists: () => false,
      fsExists: (path) => path.includes("opencode"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual({ claude: false, opencode: true });
  });

  it("reports both absent when neither the binary nor the config dir is found", async () => {
    const result = await appsDetect({ binaryExists: () => false, fsExists: () => false });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual({ claude: false, opencode: false });
  });

  it("builds the claude-code npm install command without running it", async () => {
    const calls: string[] = [];
    const fakeSpawn = async (command: string) => {
      calls.push(command);
      return { stdout: "installed", stderr: "" };
    };
    const result = await appsInstallCli("claude", fakeSpawn);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual({ stdout: "installed", stderr: "" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("@anthropic-ai/claude-code");
  });

  it("builds the opencode-ai npm install command without running it", async () => {
    const calls: string[] = [];
    const fakeSpawn = async (command: string) => {
      calls.push(command);
      return { stdout: "", stderr: "" };
    };
    const result = await appsInstallCli("opencode", fakeSpawn);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("opencode-ai");
  });

  it("returns an error for an unknown app instead of spawning", async () => {
    const calls: string[] = [];
    const fakeSpawn = async (command: string) => {
      calls.push(command);
      return { stdout: "", stderr: "" };
    };
    const result = await appsInstallCli("bogus" as never, fakeSpawn);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("shells plugin-updater init for the given app", async () => {
    const calls: string[] = [];
    const fakeSpawn = async (command: string) => {
      calls.push(command);
      return { stdout: "", stderr: "" };
    };
    const result = await appsInit("opencode", fakeSpawn);
    expect(result.ok).toBe(true);
    expect(calls[0]).toContain("plugin-updater init");
    expect(calls[0]).toContain("opencode");
  });
});
