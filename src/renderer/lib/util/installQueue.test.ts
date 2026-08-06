import { describe, it, expect } from "vitest";
import { get } from "svelte/store";
import { prerequisiteInstalls } from "./installQueue.js";
import { downloads, enqueue, resetDownloadsForTest } from "../downloads.js";

const engines = [
  { id: "plugin-updater", capability: "plugin-management", url: "https://example/plugin-updater", homes: {} },
  { id: "custom-auth", capability: "custom-endpoints", url: "https://example/custom-auth", homes: {} },
];
const homes = [
  { id: "claude", label: "Claude", dir: "/c", present: true, hasUpdater: false },
  { id: "opencode", label: "OpenCode", dir: "/o", present: true, hasUpdater: true },
];

describe("prerequisiteInstalls", () => {
  it("names the manager for a home that lacks it", () => {
    expect(prerequisiteInstalls("wakatime-sync", ["claude"], homes, engines)).toEqual([
      { homeId: "claude", id: "plugin-updater", url: "https://example/plugin-updater" },
    ]);
  });

  it("returns nothing for a home that already has it", () => {
    expect(prerequisiteInstalls("wakatime-sync", ["opencode"], homes, engines)).toEqual([]);
  });

  it("skips homes that already have it and keeps the order of the rest", () => {
    const lacking = [...homes, { id: "extra", label: "Extra", dir: "/e", present: true, hasUpdater: false }];
    const result = prerequisiteInstalls("wakatime-sync", ["extra", "opencode", "claude"], lacking, engines);
    expect(result.map((p) => p.homeId)).toEqual(["extra", "claude"]);
  });

  it("returns nothing when the plugin being installed is itself an engine", () => {
    expect(prerequisiteInstalls("plugin-updater", ["claude"], homes, engines)).toEqual([]);
    expect(prerequisiteInstalls("custom-auth", ["claude"], homes, engines)).toEqual([]);
  });

  it("returns nothing when no engine declares the capability", () => {
    expect(prerequisiteInstalls("wakatime-sync", ["claude"], homes, [])).toEqual([]);
  });

  it("ignores a home id it does not know", () => {
    expect(prerequisiteInstalls("wakatime-sync", ["ghost"], homes, engines)).toEqual([]);
  });
});

describe("queue ordering", () => {
  it("holds the plugin's task pending while the manager's task runs", async () => {
    resetDownloadsForTest();
    let releaseManager: () => void = () => {};
    const managerDone = new Promise<void>((resolve) => { releaseManager = resolve; });
    const manager = enqueue({
      label: "Install plugin-updater", home: "Claude", key: "plugin-updater",
      run: async () => { await managerDone; return { ok: true as const, data: undefined }; },
    });
    const plugin = enqueue({
      label: "Install wakatime-sync", home: "Claude", key: "wakatime-sync",
      run: async () => ({ ok: true as const, data: undefined }),
    });

    await Promise.resolve();
    const midway = get(downloads).tasks;
    expect(midway.find((t) => t.key === "plugin-updater")?.status).toBe("installing");
    expect(midway.find((t) => t.key === "wakatime-sync")?.status).toBe("pending");

    releaseManager();
    await Promise.all([manager, plugin]);
    expect(get(downloads).tasks.every((t) => t.status === "done")).toBe(true);
  });
});
