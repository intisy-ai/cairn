import { describe, it, expect, vi } from "vitest";
import { appStorageGet, appStorageSet } from "./appPaths.js";
import type { AppPathNames } from "../../../packages/shared/src/domain.js";

const NAMES: AppPathNames = { repos: "repos", plugin: "plugin", cache: "cache", config: "config" };

function descriptor(paths: AppPathNames = NAMES) {
  return { id: "claude", label: "Claude Code", paths } as never;
}

function deps(over: Record<string, unknown> = {}) {
  return {
    describe: () => descriptor(),
    homeOf: () => "/home/claude",
    move: vi.fn(() => []),
    save: vi.fn(),
    ...over,
  } as never;
}

describe("appStorageGet", () => {
  it("reports the declared names, the conventional ones, and where they land", async () => {
    const result = await appStorageGet("claude", deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.names).toEqual(NAMES);
    expect(result.data.defaults).toEqual(NAMES);
    expect(result.data.home).toBe("/home/claude");
    expect(result.data.resolved.repos).toMatch(/repos$/);
  });

  it("errors for an app the registry does not hold", async () => {
    const result = await appStorageGet("ghost", deps({ describe: () => undefined }));
    expect(result.ok).toBe(false);
  });
});

describe("appStorageSet", () => {
  it("moves the directories, then records the new names", async () => {
    const order: string[] = [];
    const move = vi.fn(() => { order.push("move"); return []; });
    const save = vi.fn(() => { order.push("save"); });

    const result = await appStorageSet("claude", { ...NAMES, repos: "clones" }, deps({ move, save }));

    expect(result.ok).toBe(true);
    expect(order).toEqual(["move", "save"]);
    expect(save).toHaveBeenCalledWith("claude", { ...NAMES, repos: "clones" });
  });

  // Recording names for directories that were never renamed points the app at storage that
  // does not exist, which reads as every plugin having vanished.
  it("does not record the names when a directory could not be moved", async () => {
    const save = vi.fn();
    const move = vi.fn(() => [{ kind: "repos", from: "repos", to: "clones", status: "target-exists" }]);

    const result = await appStorageSet("claude", { ...NAMES, repos: "clones" }, deps({ move, save }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/clones already exists/);
    expect(save).not.toHaveBeenCalled();
  });

  it("reports the underlying reason when a move fails outright", async () => {
    const move = vi.fn(() => [{ kind: "cache", from: "cache", to: "tmp", status: "failed", detail: "EPERM" }]);
    const result = await appStorageSet("claude", { ...NAMES, cache: "tmp" }, deps({ move }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/EPERM/);
  });

  // A name that would escape the home, or collide with another kind, is refused before
  // anything on disk is touched.
  it("rejects an unusable name without moving anything", async () => {
    const move = vi.fn(() => []);
    const result = await appStorageSet("claude", { ...NAMES, repos: "../elsewhere" }, deps({ move }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/repos/);
    expect(move).not.toHaveBeenCalled();
  });

  it("rejects two kinds pointing at one directory", async () => {
    const result = await appStorageSet("claude", { ...NAMES, cache: "repos" }, deps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/same as repos/);
  });

  it("errors for an app the registry does not hold", async () => {
    const result = await appStorageSet("ghost", NAMES, deps({ describe: () => undefined }));
    expect(result.ok).toBe(false);
  });

  it("hands back what actually moved", async () => {
    const moves = [{ kind: "repos", from: "repos", to: "clones", status: "moved" }];
    const result = await appStorageSet("claude", { ...NAMES, repos: "clones" }, deps({ move: () => moves }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.moves).toEqual(moves);
  });
});
