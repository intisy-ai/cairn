import { describe, it, expect, beforeEach, vi } from "vitest";
import { cached, invalidate, bustCacheForTests } from "./cache.js";

beforeEach(() => bustCacheForTests());

describe("cache", () => {
  it("returns the cached value within the TTL, fetching once", async () => {
    let now = 1000;
    const fetcher = vi.fn(async () => ({ ok: true as const, data: 1 }));
    await cached("k", 5000, fetcher, () => now);
    now = 2000;
    const second = await cached("k", 5000, fetcher, () => now);
    expect(second.data).toBe(1);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("refetches after the TTL expires", async () => {
    let now = 1000;
    const fetcher = vi.fn(async () => ({ ok: true as const, data: 1 }));
    await cached("k", 5000, fetcher, () => now);
    now = 7000;
    await cached("k", 5000, fetcher, () => now);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("de-dups concurrent fetches for the same key", async () => {
    const fetcher = vi.fn(() => Promise.resolve({ ok: true as const, data: 1 }));
    const [a, b] = await Promise.all([cached("k", 5000, fetcher), cached("k", 5000, fetcher)]);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not cache a failed Result", async () => {
    const fetcher = vi.fn(async () => ({ ok: false as const, error: "boom" }));
    await cached("k", 5000, fetcher);
    await cached("k", 5000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidate(prefix) drops matching keys only", async () => {
    const f = vi.fn(async () => ({ ok: true as const, data: 1 }));
    await cached("providers:list", 5000, f);
    await cached("plugins:list", 5000, f);
    invalidate("providers");
    await cached("providers:list", 5000, f);
    await cached("plugins:list", 5000, f);
    expect(f).toHaveBeenCalledTimes(3); // providers refetched, plugins still cached
  });
});
