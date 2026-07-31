import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { favoritesList, favoritesToggle } from "./favorites.js";

beforeEach(() => {
  process.env.HUB_CONFIG_DIR = mkdtempSync(join(tmpdir(), "dash-favorites-"));
});

describe("favoritesList", () => {
  it("returns an empty list when nothing is configured", async () => {
    const result = await favoritesList();
    expect(result).toEqual({ ok: true, data: [] });
  });
});

describe("favoritesToggle", () => {
  it("adds a plugin not yet favorited", async () => {
    const result = await favoritesToggle("wakatime-sync");
    expect(result).toEqual({ ok: true, data: ["wakatime-sync"] });
    expect(await favoritesList()).toEqual({ ok: true, data: ["wakatime-sync"] });
  });

  it("removes a plugin already favorited", async () => {
    await favoritesToggle("wakatime-sync");
    const result = await favoritesToggle("wakatime-sync");
    expect(result).toEqual({ ok: true, data: [] });
    expect(await favoritesList()).toEqual({ ok: true, data: [] });
  });

  it("tracks multiple favorites independently", async () => {
    await favoritesToggle("a");
    await favoritesToggle("b");
    const result = await favoritesToggle("a");
    expect(result).toEqual({ ok: true, data: ["b"] });
  });
});
