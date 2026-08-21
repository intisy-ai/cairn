import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface HomeSnapshot {
  path: string;
  names: string[];
}

/** Read-only: the real home is never opened for write by this harness. */
export function snapshotRealHome(...segments: string[]): HomeSnapshot {
  const path = join(homedir(), ...segments);
  let names: string[] = [];
  try {
    names = readdirSync(path).sort();
  } catch {
    names = [];
  }
  return { path, names };
}

export function sameSnapshot(before: HomeSnapshot, after: HomeSnapshot): boolean {
  return before.path === after.path
    && before.names.length === after.names.length
    && before.names.every((name, index) => name === after.names[index]);
}
