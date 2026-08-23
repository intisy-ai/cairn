import { describe, it, expect, vi } from "vitest";
import { pruneUnusedLibraries } from "./libraryPrune.js";

describe("pruneUnusedLibraries", () => {
  it("removes every library no installed plugin declares", async () => {
    const remove = vi.fn();
    const removed = await pruneUnusedLibraries("/home", "claude", {
      enabled: () => true,
      orphans: async () => ["@intisy-ai/left-behind", "@intisy-ai/also-unused"],
      remove,
    });

    expect(removed).toEqual(["@intisy-ai/left-behind", "@intisy-ai/also-unused"]);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith("/home", "@intisy-ai/left-behind", "claude");
  });

  // The toggle is the whole point: a home that installs libraries by hand must keep them.
  it("removes nothing when the setting is off", async () => {
    const remove = vi.fn();
    const removed = await pruneUnusedLibraries("/home", "claude", {
      enabled: () => false,
      orphans: async () => ["@intisy-ai/left-behind"],
      remove,
    });

    expect(removed).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("leaves a library still declared by something alone", async () => {
    const remove = vi.fn();
    expect(await pruneUnusedLibraries("/home", "claude", { enabled: () => true, orphans: async () => [], remove })).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  // The uninstall it follows already succeeded, so a library that will not delete must not
  // turn that into a failure.
  it("keeps going when one library will not delete, and reports only what went", async () => {
    const remove = vi.fn((_dir: string, specifier: string) => {
      if (specifier === "@intisy-ai/held-open") throw new Error("EBUSY");
    });

    const removed = await pruneUnusedLibraries("/home", "claude", {
      enabled: () => true,
      orphans: async () => ["@intisy-ai/held-open", "@intisy-ai/fine"],
      remove,
    });

    expect(removed).toEqual(["@intisy-ai/fine"]);
  });
});
