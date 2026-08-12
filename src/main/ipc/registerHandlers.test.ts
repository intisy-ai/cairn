// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

const handlers: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock("electron", () => ({
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => { handlers[channel] = fn; } },
}));
vi.mock("../daemon/proxyDaemon.js", () => ({ status: async () => ({}), start: async () => {}, stop: async () => {} }));

import { registerHandlers } from "./registerHandlers.js";

describe("registerHandlers", () => {
  it("forwards a long channel with the extended timeout and a normal channel with none", async () => {
    const calls: { channel: string; timeout: number | undefined }[] = [];
    const supervisor = {
      rpc: async (channel: string, _args: unknown[], timeoutMs?: number) => {
        calls.push({ channel, timeout: timeoutMs });
        return { ok: true as const, data: null };
      },
    };
    registerHandlers(supervisor);

    await handlers["plugins:install"]({}, "a", "b", "c");
    await handlers["providers:list"]({});
    await handlers["config:schemas"]({}, "claude");
    await handlers["screens:data"]({}, "demo-plugin", "config", "claude");
    await handlers["screens:invoke"]({}, "demo-plugin", "commit", "claude", {});

    expect(calls.find((c) => c.channel === "plugins:install")?.timeout).toBe(600000);
    expect(calls.find((c) => c.channel === "providers:list")?.timeout).toBeUndefined();
    // Resolving a home's plugin declarations can legitimately need seconds on a cold cache,
    // which the 15s default is too tight for.
    expect(calls.find((c) => c.channel === "config:schemas")?.timeout).toBe(60000);
    // Each must comfortably outlast the sidecar's own spawn timeout (10s / 600s in
    // uiProbe.ts) rather than race it at the IPC layer.
    expect(calls.find((c) => c.channel === "screens:data")?.timeout).toBe(25000);
    expect(calls.find((c) => c.channel === "screens:invoke")?.timeout).toBe(615000);
  });
});
