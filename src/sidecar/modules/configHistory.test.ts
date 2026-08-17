import { describe, it, expect, vi } from "vitest";

const capabilityProviders = vi.fn();
vi.mock("../lib/pluginHost.js", () => ({
  DEFAULT_CALL_TIMEOUT_MS: 10000,
  capabilityProviders,
  callHostCapability: async (_id: string, _l: string, _m: number, call: () => Promise<unknown>) => {
    try { return { ok: true as const, value: await call() }; }
    catch (error) { return { ok: false as const, error: { detail: (error as Error).message, fix: "f" } }; }
  },
}));

const homes = [{ id: "app-a", label: "App A", dir: "/homes/a", present: true, hasUpdater: true }];

describe("configHistoryList", () => {
  it("reads the home's snapshots from whichever plugin provides config-history", async () => {
    capabilityProviders.mockResolvedValue([
      { pluginId: "historian", implementation: { history: async () => [{ id: "abc", ts: 5, summary: "note", files: ["settings.json"] }], restore: async () => ({ ok: true }) } },
    ]);
    const { configHistoryList } = await import("./configHistory.js");
    expect(await configHistoryList("app-a", { homes })).toEqual({
      ok: true,
      data: [{ id: "abc", ts: 5, summary: "note", files: ["settings.json"], plugin: "historian" }],
    });
  });

  it("answers empty when nothing provides config-history", async () => {
    capabilityProviders.mockResolvedValue([]);
    const { configHistoryList } = await import("./configHistory.js");
    expect(await configHistoryList("app-a", { homes })).toEqual({ ok: true, data: [] });
  });

  it("answers empty when the provider throws, so one home never blanks the rest", async () => {
    capabilityProviders.mockResolvedValue([
      { pluginId: "historian", implementation: { history: async () => { throw new Error("no repo"); }, restore: async () => ({ ok: true }) } },
    ]);
    const { configHistoryList } = await import("./configHistory.js");
    expect(await configHistoryList("app-a", { homes })).toEqual({ ok: true, data: [] });
  });

  it("fails on an unknown home rather than silently reading nothing", async () => {
    const { configHistoryList } = await import("./configHistory.js");
    const result = await configHistoryList("ghost", { homes });
    expect(result.ok).toBe(false);
  });
});
