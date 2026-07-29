import { describe, it, expect, vi } from "vitest";
import { syncStatus, syncRun, syncSetConfig } from "./sync.js";
import type { SyncStatus } from "../../../packages/shared/src/domain.js";

const STATUS: SyncStatus = {
  enabled: true,
  categories: { accounts: true, plugins: true, settings: true, pluginConfigs: true },
  exclude: [],
  homes: ["/a", "/b"],
  pluginConfigs: ["wakatime-sync.json"],
};

describe("sidecar sync module", () => {
  it("syncStatus returns the bridge status", async () => {
    const result = await syncStatus({ status: async () => STATUS });
    expect(result.ok && result.data.homes).toEqual(["/a", "/b"]);
  });

  it("syncStatus falls back to a disabled status when the bridge is absent", async () => {
    const result = await syncStatus({ status: async () => null });
    expect(result.ok && result.data.enabled).toBe(false);
  });

  it("syncRun invokes the runner", async () => {
    const run = vi.fn(async () => {});
    const result = await syncRun({ run });
    expect(result.ok).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it("syncSetConfig writes to present host-app homes, never cairn", async () => {
    const writes: { dir: string; key: string }[] = [];
    const result = await syncSetConfig("enabled", false, {
      homes: async () => [
        { id: "cairn", dir: "/cairn", present: true },
        { id: "claude", dir: "/claude", present: true },
        { id: "opencode", dir: "/opencode", present: false },
      ],
      writeConfig: (_name, key, _value, dir) => writes.push({ dir, key }),
    });
    expect(result.ok).toBe(true);
    expect(writes).toEqual([{ dir: "/claude", key: "enabled" }]);
  });
});
