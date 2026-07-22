import { describe, it, expect } from "vitest";
import { availableRoutingApps, profileFor } from "./proxyRegistry.js";

describe("proxyRegistry", () => {
  it("lists only apps that are present", () => {
    expect(availableRoutingApps({ claude: true, opencode: false })).toEqual([
      { app: "claude", label: "Claude Code" },
    ]);
    expect(availableRoutingApps({ claude: false, opencode: false })).toEqual([]);
    expect(availableRoutingApps({ claude: true, opencode: true }).map((a) => a.app)).toEqual([
      "claude",
      "opencode",
    ]);
  });
  it("returns a routing profile for a known present app, null otherwise", () => {
    expect(profileFor("claude")).not.toBeNull();
    expect(profileFor("opencode")).not.toBeNull();
    expect(profileFor("nope")).toBeNull();
  });
});
