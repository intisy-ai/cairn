import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { marketplaceSourcesList, marketplaceSourcesSave } from "./marketplaceSources.js";
import type { MarketplaceSource } from "../../../packages/shared/src/domain.js";

beforeEach(() => {
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-mkt-sources-"));
});

const demo: MarketplaceSource = { id: "demo", label: "Demo", type: "local", path: "/tmp/demo" };

describe("marketplaceSourcesList", () => {
  it("answers with the built-in marketplace for a home that configured none", async () => {
    const result = await marketplaceSourcesList();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].type).toBe("github-org");
  });
});

describe("marketplaceSourcesSave", () => {
  it("saves the list it was given, in the order it was given", async () => {
    const save = vi.fn();
    const result = await marketplaceSourcesSave(
      [demo, { id: "org", label: "Org", type: "github-org", org: "acme" }],
      { save },
    );

    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].map((s: MarketplaceSource) => s.id)).toEqual(["demo", "org"]);
  });

  it("drops a half-declared source rather than saving one that can never be read", async () => {
    const save = vi.fn();
    await marketplaceSourcesSave([demo, { id: "broken", type: "manifest" }], { save });
    expect(save.mock.calls[0][0].map((s: MarketplaceSource) => s.id)).toEqual(["demo"]);
  });

  // Ids key the source filter and every entry's sourceId, so a duplicate would make one
  // marketplace's entries unreachable behind the other's chip.
  it("refuses a list where two marketplaces share an id", async () => {
    const save = vi.fn();
    const result = await marketplaceSourcesSave([demo, { ...demo, label: "Other" }], { save });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("share the id");
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses anything that is not a list", async () => {
    const result = await marketplaceSourcesSave({ id: "demo" }, { save: vi.fn() });
    expect(result.ok).toBe(false);
  });

  it("keeps a source the user switched off rather than dropping it", async () => {
    const save = vi.fn();
    await marketplaceSourcesSave([{ ...demo, enabled: false }], { save });
    expect(save.mock.calls[0][0][0].enabled).toBe(false);
  });
});
