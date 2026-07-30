import { describe, it, expect, vi } from "vitest";
import { ledgerHomes, ledgerCommit, ledgerProfileSwitch, ledgerRestore } from "./ledger.js";
import type { Ledger } from "@config-ledger/lib.js";
import type { PluginHome } from "../../../packages/shared/src/domain.js";

function home(id: string, dir: string, present = true): PluginHome {
  return { id, label: id, dir, present, hasUpdater: true };
}

function fakeLedger(over: Partial<Ledger> = {}): Ledger {
  return {
    ensureRepo: () => {},
    snapshots: () => [],
    history: () => [],
    commit: () => true,
    diffHead: () => [],
    diffRefs: () => [],
    restore: () => 0,
    rollbackKey: () => true,
    profiles: { list: () => [], current: () => "main", create: () => {}, switchTo: () => ({ ok: true }) },
    ...over,
  };
}

describe("sidecar ledger module", () => {
  it("ledgerHomes maps each present home's snapshots, pending and profiles", async () => {
    const res = await ledgerHomes({
      homes: async () => [home("claude", "/c"), home("opencode", "/o", false)],
      open: (dir) => fakeLedger({
        snapshots: () => [{ hash: "abc", date: "d", subject: "auto: v1" }],
        diffHead: () => [{ file: "settings.json", key: "theme", old: "light", new: "dark" }],
        profiles: { list: () => ["main", "work"], current: () => "work", create: () => {}, switchTo: () => ({ ok: true }) },
        // dir is captured so we know the right home was opened
        home: dir,
      }),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1); // opencode absent, filtered out
    expect(res.data[0].homeId).toBe("claude");
    expect(res.data[0].snapshots[0].subject).toBe("auto: v1");
    expect(res.data[0].pending[0].key).toBe("theme");
    expect(res.data[0].profiles.current).toBe("work");
  });

  it("ledgerHomes falls back to an empty view for a home whose repo errors", async () => {
    const res = await ledgerHomes({
      homes: async () => [home("claude", "/c")],
      open: () => fakeLedger({ snapshots: () => { throw new Error("not a repo"); } }),
    });
    expect(res.ok && res.data[0].snapshots).toEqual([]);
    expect(res.ok && res.data[0].profiles.current).toBe("");
  });

  it("ledgerCommit initializes the repo then commits for the named home", async () => {
    const calls: string[] = [];
    const res = await ledgerCommit("claude", "manual", {
      homes: async () => [home("claude", "/c")],
      open: (dir) => fakeLedger({
        ensureRepo: () => calls.push("ensure:" + dir),
        commit: (reason) => { calls.push("commit:" + reason); return true; },
      }),
    });
    expect(res.ok && res.data).toBe(true);
    expect(calls).toEqual(["ensure:/c", "commit:manual"]);
  });

  it("ledgerRestore returns the restored file count", async () => {
    const res = await ledgerRestore("claude", "HEAD", {
      homes: async () => [home("claude", "/c")],
      open: () => fakeLedger({ restore: () => 3 }),
    });
    expect(res.ok && res.data).toBe(3);
  });

  it("ledgerProfileSwitch surfaces the refusal reason", async () => {
    const res = await ledgerProfileSwitch("claude", "work", {
      homes: async () => [home("claude", "/c")],
      open: () => fakeLedger({
        profiles: { list: () => [], current: () => "main", create: () => {}, switchTo: () => ({ ok: false, reason: "uncommitted config changes" }) },
      }),
    });
    expect(res.ok && res.data.ok).toBe(false);
    expect(res.ok && res.data.reason).toMatch(/uncommitted/);
  });

  it("ledgerCommit errors on an unknown home", async () => {
    const res = await ledgerCommit("ghost", "x", { homes: async () => [home("claude", "/c")], open: () => fakeLedger() });
    expect(res.ok).toBe(false);
  });
});
