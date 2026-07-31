import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getConfigDir } from "@core-auth/index.js";

// A generic, persistent, namespaced key/value cache for anything Cairn wants to
// show instantly on load and refresh in the background: plugin versions, repo
// stars/readmes, and whatever comes next. Entries are opaque JSON keyed by
// (namespace, key); callers own the shape. Best-effort: a read or write failure
// never throws, it just degrades to a cache miss.

export type CacheEntry<T> = { value: T; at: number };
type CacheFile = Record<string, Record<string, CacheEntry<unknown>>>;

// Keyed by resolved file path so multiple config dirs (e.g. tests) stay isolated.
const memory = new Map<string, CacheFile>();

function cachePath(configDir: string): string {
  return join(configDir, "cache", "cairn-cache.json");
}

function load(configDir: string): CacheFile {
  const path = cachePath(configDir);
  const hit = memory.get(path);
  if (hit) return hit;
  let data: CacheFile = {};
  try {
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as CacheFile;
      if (parsed && typeof parsed === "object") data = parsed;
    }
  } catch {
    data = {};
  }
  memory.set(path, data);
  return data;
}

function persist(configDir: string, data: CacheFile): void {
  const path = cachePath(configDir);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data), "utf8");
  } catch {
    // best-effort: an unwritable cache just means the next load is a miss
  }
}

export function readCache<T>(namespace: string, key: string, configDir: string = getConfigDir()): CacheEntry<T> | null {
  if (!configDir) return null;
  const entry = load(configDir)[namespace]?.[key];
  return entry ? { value: entry.value as T, at: entry.at } : null;
}

export function readNamespace<T>(namespace: string, configDir: string = getConfigDir()): Record<string, CacheEntry<T>> {
  if (!configDir) return {};
  return (load(configDir)[namespace] ?? {}) as Record<string, CacheEntry<T>>;
}

// Writes only when the value actually changed, so an unchanged background refresh
// neither rewrites the file nor bumps timestamps. Returns whether anything changed.
export function writeCache<T>(namespace: string, key: string, value: T, configDir: string = getConfigDir(), at: number = Date.now()): boolean {
  if (!configDir) return false;
  const data = load(configDir);
  const ns = (data[namespace] ??= {});
  if (ns[key] && JSON.stringify(ns[key].value) === JSON.stringify(value)) return false;
  ns[key] = { value, at };
  persist(configDir, data);
  return true;
}

export function dropCache(namespace: string, key: string, configDir: string = getConfigDir()): void {
  if (!configDir) return;
  const ns = load(configDir)[namespace];
  if (ns && key in ns) {
    delete ns[key];
    persist(configDir, load(configDir));
  }
}

export function resetCacheForTests(): void {
  memory.clear();
}
