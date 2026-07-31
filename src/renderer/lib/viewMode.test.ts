// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { stubCairn } from "./testing.js";
import { loadViewMode, saveViewMode } from "./viewMode.js";

describe("viewMode", () => {
  beforeEach(() => stubCairn({}));
  it("defaults to list when unset", async () => {
    stubCairn({ getConfig: async () => ({ ok: true, data: undefined }) });
    expect(await loadViewMode("providers")).toBe("list");
  });
  it("returns the stored grid mode", async () => {
    stubCairn({ getConfig: async () => ({ ok: true, data: "grid" }) });
    expect(await loadViewMode("providers")).toBe("grid");
  });
  it("defaults to list on a failed read", async () => {
    stubCairn({ getConfig: async () => ({ ok: false, error: "boom" }) });
    expect(await loadViewMode("providers")).toBe("list");
  });
  it("saves the per-screen key", async () => {
    const setConfig = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({ setConfig });
    await saveViewMode("apps", "grid");
    expect(setConfig).toHaveBeenCalledWith("cairn", "viewMode.apps", "grid");
  });
});
