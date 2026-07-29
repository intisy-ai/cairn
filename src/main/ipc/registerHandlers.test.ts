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

    expect(calls.find((c) => c.channel === "plugins:install")?.timeout).toBe(600000);
    expect(calls.find((c) => c.channel === "providers:list")?.timeout).toBeUndefined();
  });
});
