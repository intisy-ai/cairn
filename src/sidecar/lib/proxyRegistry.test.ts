import { describe, it, expect } from "vitest";
import { availableRoutingApps, profileFor } from "./proxyRegistry.js";
import type { LoadedProxyDef } from "./proxyPlugins.js";
import type { RoutingProfile } from "@core-proxy/index.js";

const fakeProfile = {} as RoutingProfile;

const fakeDefs = async (): Promise<LoadedProxyDef[]> => [
  { app: "claude", label: "Claude Code", profile: () => fakeProfile },
  { app: "opencode", label: "OpenCode", profile: () => fakeProfile },
];

describe("proxyRegistry", () => {
  it("lists only apps that are present AND have an installed proxy def", async () => {
    expect(await availableRoutingApps({ claude: true, opencode: false }, { defs: fakeDefs })).toEqual([
      { app: "claude", label: "Claude Code" },
    ]);
    expect(await availableRoutingApps({ claude: false, opencode: false }, { defs: fakeDefs })).toEqual([]);
    expect((await availableRoutingApps({ claude: true, opencode: true }, { defs: fakeDefs })).map((a) => a.app)).toEqual([
      "claude",
      "opencode",
    ]);
  });

  it("excludes a present app that has no installed proxy def", async () => {
    expect(await availableRoutingApps({ claude: true, opencode: true }, { defs: async () => [] })).toEqual([]);
  });

  it("returns a routing profile for a known present app, null otherwise", async () => {
    expect(await profileFor("claude", { defs: fakeDefs })).toBe(fakeProfile);
    expect(await profileFor("opencode", { defs: fakeDefs })).toBe(fakeProfile);
    expect(await profileFor("nope", { defs: fakeDefs })).toBeNull();
  });
});
