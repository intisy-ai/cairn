import { describe, it, expect, vi } from "vitest";

const capabilityOfPlugin = vi.fn();
vi.mock("../lib/pluginHost.js", () => ({
  DEFAULT_CALL_TIMEOUT_MS: 10000,
  DEFAULT_INVOKE_TIMEOUT_MS: 600000,
  capabilityOfPlugin,
  callHostCapability: async (_id: string, _label: string, _ms: number, call: () => Promise<unknown>) => {
    try { return { ok: true as const, value: await call() }; }
    catch (error) { return { ok: false as const, error: { detail: (error as Error).message, fix: "fix it" } }; }
  },
}));

const homes = [{ id: "app-a", label: "App A", dir: "/homes/a", present: true, hasUpdater: true }];

describe("screenData", () => {
  it("reads through the screens capability, naming the screen and the home", async () => {
    const read = vi.fn(async () => ({ sources: { history: [1, 2] } }));
    capabilityOfPlugin.mockResolvedValue({ read, invoke: vi.fn(), screens: vi.fn() });
    const { screenData } = await import("./screens.js");
    const result = await screenData("historian", "config", "app-a", { homes });
    expect(result).toEqual({ ok: true, data: { sources: { history: [1, 2] } } });
    expect(read).toHaveBeenCalledWith({ screenId: "config", home: "/homes/a" });
  });

  it("reports a plugin that provides no screens rather than pretending it is empty", async () => {
    capabilityOfPlugin.mockResolvedValue(undefined);
    const { screenData } = await import("./screens.js");
    expect(await screenData("historian", "config", "app-a", { homes })).toEqual({
      ok: false, error: "historian contributes no screens in App A",
    });
  });
});

describe("screenInvoke", () => {
  it("passes the screen id, the action id, the home and the input", async () => {
    const invoke = vi.fn(async () => ({ ok: true, message: "done" }));
    capabilityOfPlugin.mockResolvedValue({ read: vi.fn(), invoke, screens: vi.fn() });
    const { screenInvoke } = await import("./screens.js");
    const result = await screenInvoke("historian", "config", "commit", "app-a", { reason: "note" }, { homes });
    expect(result).toEqual({ ok: true, data: { ok: true, message: "done" } });
    expect(invoke).toHaveBeenCalledWith({ screenId: "config", actionId: "commit", home: "/homes/a", input: { reason: "note" } });
  });

  it("returns the plugin's own failure message when the call fails", async () => {
    capabilityOfPlugin.mockResolvedValue({ read: vi.fn(), invoke: async () => { throw new Error("git said no"); }, screens: vi.fn() });
    const { screenInvoke } = await import("./screens.js");
    expect(await screenInvoke("historian", "config", "commit", "app-a", {}, { homes })).toEqual({
      ok: true, data: { ok: false, message: "git said no" },
    });
  });
});
