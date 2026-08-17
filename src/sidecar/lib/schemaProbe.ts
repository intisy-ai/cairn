import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { readCache, writeCacheMany } from "./cache.js";
import { getConfigDir } from "@core-auth/index.js";
import type { FieldSpec, ActionSpec, SectionSpec, DataSpec } from "../../../packages/shared/src/domain.js";

// Reading a plugin's settings means running its bundle, which costs a process spawn each.
// Measured on real homes that is ~0.2-1.0s per plugin, so doing it for every plugin of
// every home on demand is what made the sidecar miss its deadline. Two things fix it:
// a plugin's DECLARATION only changes when its bundle changes, so it is cached by the
// bundle's identity; its VALUES are read from disk every time, so a config write is
// visible immediately and there is no cache to invalidate.

export const SCHEMA_NS = "schemas";
export const MAX_PARALLEL = 6;
// A probe only prints a declaration; anything slower than this is wedged, not working.
export const PROBE_TIMEOUT_MS = 3000;

export interface Declaration {
  defaults: Record<string, unknown>;
  fields?: FieldSpec[];
  actions?: ActionSpec[];
  sections?: SectionSpec[];
  data?: DataSpec;
}

export interface Bundle {
  plugin: string;
  path: string;
}

type ProbeOutput = { name?: unknown; defaults?: unknown; fields?: unknown; actions?: unknown; sections?: unknown; data?: unknown } | null;
type SpawnFn = (bundlePath: string) => Promise<ProbeOutput>;

export interface ProbeDeps {
  spawn?: SpawnFn;
  cacheDir?: string;
}

// mtime plus size: a redeploy changes both, and a same-size rewrite still changes mtime.
export function bundleId(path: string): string | null {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}

// A bundle that exits non-zero or prints something else has no settings to offer, and that
// answer keeps until the bundle itself changes, so it resolves to null (which is cached).
// A timeout says nothing about the bundle, so it throws instead and is never remembered.
function realSpawn(bundlePath: string): Promise<ProbeOutput> {
  return new Promise((done, fail) => {
    execFile("node", [bundlePath, "config", "schema"], { timeout: PROBE_TIMEOUT_MS }, (error, stdout) => {
      if (error && (error as { killed?: boolean }).killed) { fail(new Error(`probe timed out: ${bundlePath}`)); return; }
      if (error) { done(null); return; }
      try {
        done(JSON.parse(stdout.trim()) as ProbeOutput);
      } catch {
        done(null);
      }
    });
  });
}

function toDeclaration(output: ProbeOutput): Declaration | null {
  if (!output || typeof output.name !== "string") return null;
  const declaration: Declaration = { defaults: (output.defaults ?? {}) as Record<string, unknown> };
  if (Array.isArray(output.fields)) declaration.fields = output.fields as FieldSpec[];
  if (Array.isArray(output.actions)) declaration.actions = output.actions as ActionSpec[];
  if (Array.isArray(output.sections)) declaration.sections = output.sections as SectionSpec[];
  if (output.data && typeof output.data === "object") declaration.data = output.data as DataSpec;
  return declaration;
}

async function drain(queue: Bundle[], worker: (bundle: Bundle) => Promise<void>): Promise<void> {
  const runners = Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await worker(next);
  });
  await Promise.all(runners);
}

// Resolves each plugin's declaration, from the cache where the bundle is unchanged and
// from a bounded set of concurrent probes otherwise. A plugin whose probe fails or whose
// bundle is missing is left out of the result and NOT cached, so a transient failure is
// retried rather than remembered.
export async function probeDeclarations(bundles: Bundle[], deps: ProbeDeps = {}): Promise<Map<string, Declaration>> {
  const spawn = deps.spawn ?? realSpawn;
  const cacheDir = deps.cacheDir ?? getConfigDir();
  const resolved = new Map<string, Declaration>();
  const misses: Bundle[] = [];
  const ids = new Map<string, string>();

  for (const bundle of bundles) {
    const id = bundleId(bundle.path);
    if (!id) continue;
    ids.set(bundle.plugin, id);
    // Keyed by the bundle's PATH, not the plugin name: the same plugin is deployed into
    // several homes, and keying by name alone makes those homes evict each other's entries.
    const cached = readCache<{ id: string; declaration: Declaration | null }>(SCHEMA_NS, bundle.path, cacheDir);
    if (cached && cached.value.id === id) {
      // A remembered null means this exact bundle has no settings: nothing to resolve, and
      // nothing to re-run either.
      if (cached.value.declaration) resolved.set(bundle.plugin, cached.value.declaration);
      continue;
    }
    misses.push(bundle);
  }

  const fresh: Record<string, { id: string; declaration: Declaration | null }> = {};
  await drain(misses, async (bundle) => {
    let declaration: Declaration | null;
    // A wedged bundle must cost only its own settings, not the batch's, and must not be
    // remembered: leaving it out of `fresh` is what makes the next pass try again.
    try {
      declaration = toDeclaration(await spawn(bundle.path));
    } catch {
      return;
    }
    if (declaration) resolved.set(bundle.plugin, declaration);
    const id = ids.get(bundle.plugin);
    if (id) fresh[bundle.path] = { id, declaration };
  });
  if (Object.keys(fresh).length > 0) writeCacheMany(SCHEMA_NS, fresh, cacheDir);

  return resolved;
}

// A plugin's on-disk values, read fresh every call. Same preference order as core's own
// config reader: the config subdir wins, the home root is the fallback.
export function readCurrentValues(dir: string, plugin: string): Record<string, unknown> {
  const base = resolve(dir);
  for (const candidate of [join(dir, "config", `${plugin}.json`), join(dir, `${plugin}.json`)]) {
    const file = resolve(candidate);
    if (!file.startsWith(base + sep)) continue;
    try {
      if (!existsSync(file)) continue;
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* an unreadable config means no values, never a crash */ }
  }
  return {};
}
