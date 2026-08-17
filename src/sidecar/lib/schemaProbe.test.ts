import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeDeclarations, readCurrentValues, bundleId, SCHEMA_NS, MAX_PARALLEL } from "./schemaProbe.js";
import { writeCache, resetCacheForTests } from "./cache.js";

let dir: string;

beforeEach(() => {
  resetCacheForTests();
  dir = mkdtempSync(join(tmpdir(), "cairn-probe-"));
  mkdirSync(join(dir, "plugin"), { recursive: true });
  mkdirSync(join(dir, "config"), { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function bundle(name: string, body = "// bundle"): { plugin: string; path: string } {
  const path = join(dir, "plugin", `${name}.js`);
  writeFileSync(path, body, "utf8");
  return { plugin: name, path };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

describe("probeDeclarations", () => {
  it("spawns nothing when the cached entry matches the bundle on disk", async () => {
    const b = bundle("plugin-a");
    writeCache(SCHEMA_NS, b.path, { id: bundleId(b.path), declaration: { defaults: { logging: true } } }, dir);
    const spawn = vi.fn();

    const result = await probeDeclarations([b], { spawn, cacheDir: dir });

    expect(spawn).not.toHaveBeenCalled();
    expect(result.get("plugin-a")).toEqual({ defaults: { logging: true } });
  });

  // A redeploy rewrites the bundle, so the cached declaration must not survive it.
  it("re-probes a bundle that changed since it was cached", async () => {
    const b = bundle("plugin-a");
    writeCache(SCHEMA_NS, b.path, { id: "0:0", declaration: { defaults: { logging: true } } }, dir);
    const spawn = vi.fn(async () => ({ name: "plugin-a", defaults: { logging: false } }));

    const result = await probeDeclarations([b], { spawn, cacheDir: dir });

    expect(spawn).toHaveBeenCalledOnce();
    expect(result.get("plugin-a")).toEqual({ defaults: { logging: false } });
  });

  it("carries the declared fields and actions through", async () => {
    const b = bundle("plugin-a");
    const spawn = vi.fn(async () => ({
      name: "plugin-a",
      defaults: { x: 1 },
      current: { x: 2 },
      fields: [{ key: "x", type: "number" }],
      actions: [{ id: "go", label: "Go" }],
    }));

    const result = await probeDeclarations([b], { spawn, cacheDir: dir });

    expect(result.get("plugin-a")).toEqual({
      defaults: { x: 1 },
      fields: [{ key: "x", type: "number" }],
      actions: [{ id: "go", label: "Go" }],
    });
  });

  it("drops a screens field the probe still prints, since screens travel through the screens capability", async () => {
    const b = bundle("plugin-a");
    const spawn = vi.fn(async () => ({
      name: "plugin-a",
      defaults: {},
      screens: [{ id: "s", label: "A", layout: { kind: "stack" } }],
    }));

    const result = await probeDeclarations([b], { spawn, cacheDir: dir });

    expect(result.get("plugin-a")).toEqual({ defaults: {} });
  });

  it("caches the declaration only, never the values a probe happened to print", async () => {
    const b = bundle("plugin-a");
    await probeDeclarations([b], { spawn: async () => ({ name: "plugin-a", defaults: {}, current: { stale: true } }), cacheDir: dir });

    const spawn = vi.fn();
    const result = await probeDeclarations([b], { spawn, cacheDir: dir });

    expect(spawn).not.toHaveBeenCalled();
    expect(result.get("plugin-a")).not.toHaveProperty("current");
  });

  it("probes concurrently, but never more than the cap at once", async () => {
    const bundles = Array.from({ length: 20 }, (_, i) => bundle(`p${i}`));
    let live = 0;
    let peak = 0;
    const spawn = async (): Promise<{ name: string; defaults: Record<string, unknown> }> => {
      live += 1;
      peak = Math.max(peak, live);
      await tick();
      live -= 1;
      return { name: "x", defaults: {} };
    };

    await probeDeclarations(bundles, { spawn, cacheDir: dir });

    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(MAX_PARALLEL);
  });

  it("drops a bundle that refuses without losing the rest of the batch", async () => {
    const bad = bundle("bad");
    const good = bundle("good");
    const spawn = async (path: string) => {
      if (path.includes("bad")) throw new Error("probe timed out");
      return { name: "good", defaults: {} };
    };

    const result = await probeDeclarations([bad, good], { spawn, cacheDir: dir });

    expect([...result.keys()]).toEqual(["good"]);
  });

  // A plugin with no config CLI answers "nothing" every time it is asked, and asking cost
  // real time on a real home (one third-party bundle took ~1s to refuse, on every load).
  it("remembers that a bundle has no settings, so it is not re-run every load", async () => {
    const b = bundle("plain");
    const spawn = vi.fn(async () => null);

    await probeDeclarations([b], { spawn, cacheDir: dir });
    const second = await probeDeclarations([b], { spawn, cacheDir: dir });

    expect(spawn).toHaveBeenCalledOnce();
    expect(second.size).toBe(0);
  });

  it("asks again once a bundle that had no settings is redeployed", async () => {
    const b = bundle("plain");
    await probeDeclarations([b], { spawn: async () => null, cacheDir: dir });
    writeFileSync(b.path, "// redeployed, now with a config CLI", "utf8");

    const result = await probeDeclarations([b], { spawn: async () => ({ name: "plain", defaults: { now: true } }), cacheDir: dir });

    expect(result.get("plain")).toEqual({ defaults: { now: true } });
  });

  it("does not cache a failure, so a transient timeout is retried next time", async () => {
    const b = bundle("flaky");
    await probeDeclarations([b], { spawn: async () => { throw new Error("timeout"); }, cacheDir: dir });

    const spawn = vi.fn(async () => ({ name: "flaky", defaults: { ok: true } }));
    const result = await probeDeclarations([b], { spawn, cacheDir: dir });

    expect(spawn).toHaveBeenCalledOnce();
    expect(result.get("flaky")).toEqual({ defaults: { ok: true } });
  });

  it("skips a bundle that is not on disk without probing it", async () => {
    const spawn = vi.fn();
    const result = await probeDeclarations([{ plugin: "ghost", path: join(dir, "plugin", "ghost.js") }], { spawn, cacheDir: dir });

    expect(spawn).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it("ignores an answer that is not a declaration at all", async () => {
    const b = bundle("noisy");
    const result = await probeDeclarations([b], { spawn: async () => null, cacheDir: dir });
    expect(result.size).toBe(0);
  });
});

describe("readCurrentValues", () => {
  it("reads the values in the home's config dir", () => {
    writeFileSync(join(dir, "config", "plugin-a.json"), JSON.stringify({ logging: false }), "utf8");
    expect(readCurrentValues(dir, "plugin-a")).toEqual({ logging: false });
  });

  it("falls back to a config file at the home root", () => {
    writeFileSync(join(dir, "plugin-a.json"), JSON.stringify({ logging: false }), "utf8");
    expect(readCurrentValues(dir, "plugin-a")).toEqual({ logging: false });
  });

  it("prefers the config subdir, like every other config reader", () => {
    writeFileSync(join(dir, "plugin-a.json"), JSON.stringify({ from: "root" }), "utf8");
    writeFileSync(join(dir, "config", "plugin-a.json"), JSON.stringify({ from: "config" }), "utf8");
    expect(readCurrentValues(dir, "plugin-a")).toEqual({ from: "config" });
  });

  // This is why the declaration is cached and the values are not: a write must be
  // visible on the very next read, with no cache to invalidate.
  it("sees a value written after an earlier read", () => {
    expect(readCurrentValues(dir, "plugin-a")).toEqual({});
    writeFileSync(join(dir, "config", "plugin-a.json"), JSON.stringify({ logging: false }), "utf8");
    expect(readCurrentValues(dir, "plugin-a")).toEqual({ logging: false });
  });

  it("treats an unreadable config as no values rather than throwing", () => {
    writeFileSync(join(dir, "config", "plugin-a.json"), "{ not json", "utf8");
    expect(readCurrentValues(dir, "plugin-a")).toEqual({});
  });

  it("refuses a plugin name that would escape the home", () => {
    expect(readCurrentValues(dir, "../escape")).toEqual({});
  });
});

// Two homes deploy the same plugin name with different bundles. Measured against real homes,
// keying the cache by name alone made each home evict the other's entry, so every pass
// re-spawned everything and the cache bought nothing.
describe("several homes, same plugin names", () => {
  it("keeps one entry per deployed bundle, so warm passes stay warm", async () => {
    const homeA = join(dir, "a");
    const homeB = join(dir, "b");
    mkdirSync(homeA, { recursive: true });
    mkdirSync(homeB, { recursive: true });
    const inA = { plugin: "shared", path: join(homeA, "shared.js") };
    const inB = { plugin: "shared", path: join(homeB, "shared.js") };
    writeFileSync(inA.path, "// bundle A", "utf8");
    writeFileSync(inB.path, "// bundle B, deliberately a different size", "utf8");

    let spawns = 0;
    const spawn = async (): Promise<{ name: string; defaults: Record<string, unknown> }> => {
      spawns += 1;
      return { name: "shared", defaults: {} };
    };

    await probeDeclarations([inA], { spawn, cacheDir: dir });
    await probeDeclarations([inB], { spawn, cacheDir: dir });
    expect(spawns).toBe(2);

    await probeDeclarations([inA], { spawn, cacheDir: dir });
    await probeDeclarations([inB], { spawn, cacheDir: dir });
    expect(spawns).toBe(2);
  });
});
