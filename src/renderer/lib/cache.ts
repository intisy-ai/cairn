// A small client-side read cache: return a cached value while it is younger than
// its TTL, de-dup concurrent fetches for the same key, and let mutations
// invalidate. Failed Results are never cached, so errors retry next visit.

type Entry<T> = { at: number; value: T };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function isFailure(value: unknown): boolean {
  return !!value && typeof value === "object" && (value as { ok?: boolean }).ok === false;
}

export function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && now() - hit.at < ttlMs) return Promise.resolve(hit.value);

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fetcher()
    .then((value) => {
      if (!isFailure(value)) store.set(key, { at: now(), value });
      inflight.delete(key);
      return value;
    })
    .catch((error) => {
      inflight.delete(key);
      throw error;
    });
  inflight.set(key, promise);
  return promise;
}

export function invalidate(prefix?: string): void {
  if (prefix === undefined) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function bustCacheForTests(): void {
  store.clear();
  inflight.clear();
}
