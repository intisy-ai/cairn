import { describe, it, expect } from "vitest";
import { anthropicProfile } from "@claude-code-proxy/index.js";
import { createProxyServer, makeDynamicResolver } from "@core-proxy/index.js";
import { buildStartOptions, isRunning } from "./proxyDaemon.js";

describe("buildStartOptions", () => {
  it("assembles the startLoaderProxy options for the given configDir", () => {
    const options = buildStartOptions("/some/dir");
    expect(options.configDir).toBe("/some/dir");
    expect(options.port).toBe(34567);
    expect(options.createProxyServer).toBe(createProxyServer);
    expect(options.makeDynamicResolver).toBe(makeDynamicResolver);
    expect(options.profile.configFile).toBe(anthropicProfile().configFile);
    expect(options.profile.envPrefix).toBe(anthropicProfile().envPrefix);
  });
});

describe("isRunning", () => {
  it("resolves true when the probe succeeds", async () => {
    expect(await isRunning(async () => true)).toBe(true);
  });

  it("resolves false when the probe fails", async () => {
    expect(await isRunning(async () => false)).toBe(false);
  });
});
