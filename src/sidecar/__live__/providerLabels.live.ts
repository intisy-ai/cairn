// Provider rows fall back to the raw id when the handler's defs cannot be loaded, so a row
// showing an id is the visible symptom of a provider that failed to load.
import { describe, it, expect } from "vitest";
import { providersList } from "../modules/providers.js";

describe("provider labels against the real homes", () => {
  it("labels every provider", async () => {
    const result = await providersList();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const row of result.data) console.log(`  ${row.id.padEnd(16)} -> ${JSON.stringify(row.label)}  auth=${row.authKind} accounts=${row.accountCount}`);
    expect(result.data.filter((r) => r.label === r.id)).toEqual([]);
  });
});
