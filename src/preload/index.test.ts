// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { INVOKE_CHANNELS } from "@cairn/shared";
import type { CairnAPI } from "@cairn/shared";

const invokeCalls: { channel: string; args: unknown[] }[] = [];
let exposed: CairnAPI | undefined;

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: (_name: string, api: CairnAPI) => { exposed = api; } },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => { invokeCalls.push({ channel, args }); return Promise.resolve({ ok: true, data: channel }); },
    send: () => {},
    on: () => {},
    removeListener: () => {},
  },
}));

await import("./index.js");

describe("preload bridge", () => {
  it("exposes one method per channel, each forwarding args to its mapped channel", async () => {
    const api = exposed as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    for (const [method, channel] of Object.entries(INVOKE_CHANNELS)) {
      invokeCalls.length = 0;
      expect(typeof api[method]).toBe("function");
      await api[method]("arg1", "arg2");
      expect(invokeCalls).toEqual([{ channel, args: ["arg1", "arg2"] }]);
    }
  });
});
