// Confirms the Libraries screen has something to show on THIS machine: the reading goes
// through the optional-engine loader, which degrades to empty when plugin-updater cannot be
// loaded, so a wiring failure looks exactly like an empty home.
import { describe, it, expect } from "vitest";
import { librariesList } from "../modules/libraries.js";
import { appStorageGet } from "../modules/appPaths.js";

describe("libraries against the real homes", () => {
  it("reads a shared store", async () => {
    const result = await librariesList();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const home of result.data) {
      console.log(`${home.home.id}: ${home.shared.length} shared, ${home.plugins.length} plugins with deps`);
      for (const lib of home.shared.slice(0, 4)) console.log(`   ${lib.specifier}@${lib.version} <- ${lib.usedBy.join(", ") || "unused"}`);
    }
    expect(result.data.some((h) => h.shared.length > 0 || h.plugins.length > 0)).toBe(true);
  });

  it("reads an app's storage names", async () => {
    const result = await appStorageGet("claude");
    console.log("claude storage:", JSON.stringify(result));
    expect(result.ok).toBe(true);
  });
});
