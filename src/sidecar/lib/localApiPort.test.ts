import { describe, it, expect, beforeEach, vi } from "vitest";

const store: Record<string, unknown> = {};
vi.mock("@core/index.js", () => ({
  getConfigValue: (name: string, key: string) => store[name + ":" + key],
}));

import { resolveLocalApiPort } from "./localApiPort.js";
import { PROXY_PORT } from "../../../packages/shared/src/proxy.js";

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

describe("resolveLocalApiPort", () => {
  it("falls back to the default when unset", () => {
    expect(resolveLocalApiPort()).toBe(PROXY_PORT);
  });

  it("returns a configured numeric port", () => {
    store["cairn:localApiPort"] = 40000;
    expect(resolveLocalApiPort()).toBe(40000);
  });

  it("coerces a numeric string", () => {
    store["cairn:localApiPort"] = "8080";
    expect(resolveLocalApiPort()).toBe(8080);
  });

  it("rejects an out-of-range or non-numeric value", () => {
    store["cairn:localApiPort"] = 70000;
    expect(resolveLocalApiPort()).toBe(PROXY_PORT);
    store["cairn:localApiPort"] = "not-a-port";
    expect(resolveLocalApiPort()).toBe(PROXY_PORT);
  });
});
