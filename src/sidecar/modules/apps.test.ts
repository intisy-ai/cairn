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

  it("installs the claude-code npm package as an arg-array spawn, not a shell string", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = async (file: string, args: string[]) => {
      calls.push({ file, args });
      return { stdout: "installed", stderr: "" };
    };
    const result = await appsInstallCli("claude", fakeSpawn);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual({ stdout: "installed", stderr: "" });
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe("npm");
    expect(calls[0].args).toEqual(["install", "-g", "@anthropic-ai/claude-code"]);
  });

  it("installs the opencode-ai npm package as an arg-array spawn", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = async (file: string, args: string[]) => {
      calls.push({ file, args });
      return { stdout: "", stderr: "" };
    };
    const result = await appsInstallCli("opencode", fakeSpawn);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe("npm");
    expect(calls[0].args).toContain("opencode-ai");
  });

  it("returns an error for an unknown app instead of spawning", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = async (file: string, args: string[]) => {
      calls.push({ file, args });
      return { stdout: "", stderr: "" };
    };
    const result = await appsInstallCli("bogus" as never, fakeSpawn);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("runs plugin-updater init for the given app as an arg-array spawn", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = async (file: string, args: string[]) => {
      calls.push({ file, args });
      return { stdout: "", stderr: "" };
    };
    const result = await appsInit("opencode", fakeSpawn);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe("npx");
    expect(calls[0].args).toEqual(["plugin-updater", "init", "--app", "opencode"]);
  });

  it("returns an error for an unknown app on init instead of spawning", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = async (file: string, args: string[]) => {
      calls.push({ file, args });
      return { stdout: "", stderr: "" };
    };
    const result = await appsInit("bogus" as never, fakeSpawn);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
