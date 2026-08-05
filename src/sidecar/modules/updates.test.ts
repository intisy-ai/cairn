import { describe, it, expect } from "vitest";
import type { PluginHome } from "../../../packages/shared/src/domain.js";

const claudeDir = "/tmp/updates-claude";
const cairnDir = "/tmp/updates-cairn";

function home(id: string, dir: string, present = true): PluginHome {
  return { id, label: id, dir, present, hasUpdater: true } as PluginHome;
}

const fakeHomes: PluginHome[] = [home("cairn", cairnDir), home("claude", claudeDir)];

describe("updates sidecar module", () => {
  it("checks the home the caller named and reports what is available", async () => {
    const { updatesCheck } = await import("./updates.js");
    const seen: string[] = [];
    const result = await updatesCheck("claude", {
      homes: async () => fakeHomes,
      checkUpdates: async (dir: string) => {
        seen.push(dir);
        return { checkedAt: "2026-08-05T00:00:00.000Z", available: ["plugin-a"] };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.available).toEqual(["plugin-a"]);
    expect(result.data.checkedAt).toBe("2026-08-05T00:00:00.000Z");
    expect(seen).toEqual([claudeDir]);
  });

  it("updates one plugin in the named home and passes the name through", async () => {
    const { updatesOne } = await import("./updates.js");
    const calls: { dir: string; name: string }[] = [];
    const result = await updatesOne("claude", "plugin-a", {
      homes: async () => fakeHomes,
      updateOne: async (dir: string, name: string) => {
        calls.push({ dir, name });
        return { updated: [name], skipped: [], failed: [], checkedAt: "t" };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.updated).toEqual(["plugin-a"]);
    expect(calls).toEqual([{ dir: claudeDir, name: "plugin-a" }]);
  });

  it("updates everything in the named home", async () => {
    const { updatesAll } = await import("./updates.js");
    const result = await updatesAll("cairn", {
      homes: async () => fakeHomes,
      updateAll: async () => ({ updated: ["a", "b"], skipped: ["c"], failed: [], checkedAt: "t" }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toMatchObject({ updated: ["a", "b"], skipped: ["c"], failed: [] });
  });

  it("refuses a home it does not know, without calling the engine", async () => {
    const { updatesAll } = await import("./updates.js");
    let called = false;
    const result = await updatesAll("nope", {
      homes: async () => fakeHomes,
      updateAll: async () => { called = true; return { updated: [], skipped: [], failed: [], checkedAt: "" }; },
    });

    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("reports a failing engine as a failed result rather than throwing", async () => {
    const { updatesCheck } = await import("./updates.js");
    const result = await updatesCheck("claude", {
      homes: async () => fakeHomes,
      checkUpdates: async () => { throw new Error("ls-remote failed"); },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("ls-remote failed");
  });
});
